import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';
import { canonicalizeEtag } from '../images/canonical-etag';
import { r2CopyDestinationCreateOnlyMiddleware } from '../images/storage.service';
import {
  canonicalSha256,
  readProtectedJson,
  sha256,
  writeSmokeReceipt,
  type ProductionSmokeCheck,
  type ProductionSmokeEnvironment,
  type SmokeOwnedResource,
} from './image-upload-production-smoke-contract';
import {
  createProductionSmokeLiveAdapter,
  type ProductionSmokeObjectIdentity,
  type ProductionSmokeUpload,
  type ProductionSmokeUploadInput,
} from './image-upload-production-smoke-live';
import type {
  ProductionSmokeDependencies,
  SmokeRunContext,
} from './image-upload-production-smoke-orchestrator';
import {
  ProductionSmokePgAdapter,
  type ProductionSmokePendingUpload,
  type ProductionSmokePgBinding,
} from './image-upload-production-smoke-pg';

type Json = Record<string, unknown>;

type ScenarioUpload = Readonly<{
  request: ProductionSmokeUploadInput;
  upload: ProductionSmokeUpload;
  pending: ProductionSmokePendingUpload;
}>;

type FaultScenario = Readonly<{
  upload: ScenarioUpload;
  binding: ProductionSmokePgBinding;
  destinationBefore: ProductionSmokeObjectIdentity;
}>;

function sameRelease(
  value: unknown,
  environment: ProductionSmokeEnvironment,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Json;
  return (
    release.imageReference === environment.release.imageReference &&
    release.imageDigest === environment.release.imageDigest &&
    (release.commitSha === environment.release.commitSha ||
      release.imageCommitSha === environment.release.commitSha) &&
    release.releaseFingerprint === environment.release.releaseFingerprint
  );
}

function assertCanonical(document: Json, name: string): void {
  if (
    typeof document.canonicalSha256 !== 'string' ||
    document.canonicalSha256 !== canonicalSha256(document)
  ) {
    throw new Error(`production smoke ${name} canonical binding failed`);
  }
}

async function verifyProtectedAdmission(
  environment: ProductionSmokeEnvironment,
): Promise<void> {
  const [receiptBytes, approvalBytes, receipt, approval, authorization] =
    await Promise.all([
      readFile(environment.paths.phase1Receipt),
      readFile(environment.paths.phase1Approval),
      readProtectedJson(environment.paths.phase1Receipt),
      readProtectedJson(environment.paths.phase1Approval),
      readProtectedJson(environment.paths.authorization),
    ]);
  assertCanonical(receipt, 'Phase 1 receipt');
  assertCanonical(approval, 'Phase 1 approval');
  assertCanonical(authorization, 'smoke authorization');
  if (
    receipt.schemaVersion !==
      'image-upload-production-gate-receipt/v3-post-start-polling' ||
    !sameRelease(receipt.release, environment) ||
    approval.schemaVersion !==
      'image-upload-production-gate-approval/v3-post-start-polling' ||
    approval.decision !== 'approved' ||
    receipt.receiptPathSha256 !==
      sha256(Buffer.from(resolve(environment.paths.phase1Receipt))) ||
    approval.receiptPathSha256 !==
      sha256(Buffer.from(resolve(environment.paths.phase1Receipt))) ||
    approval.receiptSha256 !== sha256(receiptBytes) ||
    authorization.schemaVersion !==
      'image-upload-operator-smoke-authorization/v1' ||
    authorization.decision !== 'approved' ||
    !sameRelease(authorization.release, environment) ||
    authorization.operatorFingerprintSha256 !==
      sha256(Buffer.from(environment.secrets.operatorToken)) ||
    receiptBytes.length < 1 ||
    approvalBytes.length < 1
  ) {
    throw new Error('production smoke protected admission binding failed');
  }
}

class R2SmokeStore {
  private readonly client: S3Client;

  constructor(
    endpoint: string,
    private readonly bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      maxAttempts: 1,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async head(
    objectKey: string,
    signal: AbortSignal,
  ): Promise<ProductionSmokeObjectIdentity | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
        { abortSignal: signal },
      );
      if (
        !result.ETag ||
        result.ContentLength === undefined ||
        !result.ContentType
      ) {
        throw new Error('production smoke R2 HEAD evidence is incomplete');
      }
      return {
        etag: canonicalizeEtag(result.ETag),
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        metadata: Object.freeze({ ...(result.Metadata ?? {}) }),
      };
    } catch (error) {
      const provider = error as { $metadata?: { httpStatusCode?: number } };
      if (provider.$metadata?.httpStatusCode === 404) return null;
      throw new Error('production smoke R2 HEAD failed');
    }
  }

  async copyCreateOnly(options: {
    source: string;
    destination: string;
    sourceEtag: string;
    promotionId: string;
    sha256: string;
    bytes: number;
    mime: string;
    width: number;
    height: number;
    policyVersion: string;
    signal: AbortSignal;
  }): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      Key: options.destination,
      CopySource: encodeURIComponent(
        `/${this.bucket}/${options.source}`,
      ).replace(/%2F/g, '/'),
      CopySourceIfMatch: `"${options.sourceEtag}"`,
      MetadataDirective: 'REPLACE',
      ContentType: options.mime,
      Metadata: {
        sha256: options.sha256,
        'promotion-id': options.promotionId,
        bytes: String(options.bytes),
        width: String(options.width),
        height: String(options.height),
        policy: options.policyVersion,
      },
    });
    command.middlewareStack.addRelativeTo(
      r2CopyDestinationCreateOnlyMiddleware,
      {
        name: 'productionSmokeCreateOnly',
        relation: 'before',
        toMiddleware: 'awsAuthMiddleware',
      },
    );
    try {
      await this.client.send(command, { abortSignal: options.signal });
    } catch {
      throw new Error('production smoke R2 copy failed');
    }
  }

  async putConflict(objectKey: string, signal: AbortSignal): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: Buffer.from('runner-owned-conflict'),
          ContentType: 'application/octet-stream',
          Metadata: { sha256: '0'.repeat(64) },
        }),
        { abortSignal: signal },
      );
    } catch {
      throw new Error('production smoke R2 conflict preparation failed');
    }
  }

  async delete(objectKey: string, signal: AbortSignal): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
        { abortSignal: signal },
      );
    } catch {
      throw new Error('production smoke R2 cleanup failed');
    }
  }

  destroy(): void {
    this.client.destroy();
  }
}

async function localDeniedOrigin(): Promise<{
  server: Server;
  origin: string;
}> {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(
      '<!doctype html><title>production smoke denied origin</title>',
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}` };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('production smoke aborted'));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('production smoke aborted'));
      },
      { once: true },
    );
  });
}

function terminalConsumed(value: Json): boolean {
  return (
    value.outcome === 'consumed' && typeof value.resultImageId === 'string'
  );
}

function adminIdFromBearer(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('production smoke admin bearer token is invalid');
  }
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as Json;
    if (typeof payload.sub === 'string' && payload.sub.length > 0) {
      return payload.sub;
    }
  } catch {
    // Fall through to the sanitized error below.
  }
  throw new Error('production smoke admin bearer token is invalid');
}

export async function buildProductionSmokeDependencies(
  environment: ProductionSmokeEnvironment,
): Promise<ProductionSmokeDependencies> {
  const pool = new Pool({ connectionString: environment.secrets.databaseUrl });
  const pg = new ProductionSmokePgAdapter(
    pool,
    environment.release.releaseFingerprint,
  );
  const store = new R2SmokeStore(
    environment.r2Endpoint,
    environment.r2Bucket,
    environment.secrets.r2AccessKeyId,
    environment.secrets.r2SecretAccessKey,
  );
  const denied = await localDeniedOrigin();
  let browser: Browser | undefined;
  let activeContext: SmokeRunContext | undefined;
  const adminId = adminIdFromBearer(environment.secrets.adminBearerToken);
  const imageBytes = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })
    .webp({ lossless: true })
    .toBuffer();
  const imageSha256 = createHash('sha256').update(imageBytes).digest('hex');
  const state: {
    policyVersion?: string;
    normal?: ScenarioUpload;
    normalImageId?: string;
    normalDestination?: string;
    responseLoss?: FaultScenario;
    responseImageId?: string;
    responseImageUrl?: string;
  } = {};

  const live = createProductionSmokeLiveAdapter(
    {
      apiBaseUrl: environment.apiBaseUrl,
      imgproxyBaseUrl: environment.imgproxyBaseUrl,
      allowedBrowserOrigin: environment.browserOrigin,
      deniedBrowserOrigin: denied.origin,
      adminBearerToken: environment.secrets.adminBearerToken,
      smokeToken: environment.secrets.smokeToken,
      requestTimeoutMs: 30_000,
      pollIntervalMs: 2_000,
    },
    {
      browserPut: async (options) => {
        browser ??= await chromium.launch({ headless: true });
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(options.origin, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          });
          return await page.evaluate(
            async ({ url, contentType, body }) => {
              try {
                const response = await fetch(url, {
                  method: 'PUT',
                  headers: { 'content-type': contentType },
                  body: new Uint8Array(body),
                });
                return { ok: response.ok };
              } catch (error) {
                return {
                  ok: false,
                  errorName:
                    error instanceof Error ? error.name : 'UnknownError',
                };
              }
            },
            {
              url: options.url,
              contentType: options.contentType,
              body: [...options.body],
            },
          );
        } finally {
          await context.close();
        }
      },
      headObject: (key, signal) => store.head(key, signal),
      decodeImage: async (bytes) => {
        const metadata = await sharp(bytes).metadata();
        if (!metadata.width || !metadata.height) {
          throw new Error('production smoke decoded dimensions are absent');
        }
        return { width: metadata.width, height: metadata.height };
      },
      recordResource: (resource) => {
        if (!activeContext) {
          throw new Error('production smoke journal context is unavailable');
        }
        return activeContext.recordResource(resource);
      },
    },
  );

  const request = (suffix: string): ProductionSmokeUploadInput => ({
    clientRequestId: randomUUID(),
    albumId: environment.albumId,
    filename: `operator-smoke-${suffix}.webp`,
    contentType: 'image/webp',
    fileSize: imageBytes.length,
    processedSha256: imageSha256,
    policyVersion:
      state.policyVersion ??
      (() => {
        throw new Error('production smoke policy is unavailable');
      })(),
  });

  const createScenarioUpload = async (
    suffix: string,
    context: SmokeRunContext,
    signal: AbortSignal,
  ): Promise<ScenarioUpload> => {
    activeContext = context;
    const uploadRequest = request(suffix);
    const upload = await live.createUpload(uploadRequest, signal);
    const pending = await pg.inspectOwnedPendingUpload({
      uploadId: upload.uploadId,
      adminId,
      clientRequestId: uploadRequest.clientRequestId,
      runStartedAt: context.createdAt,
      releaseFingerprint: environment.release.releaseFingerprint,
    });
    return { request: uploadRequest, upload, pending };
  };

  const binding = (
    scenario: ScenarioUpload,
    context: SmokeRunContext,
    promotionId = randomUUID(),
  ): ProductionSmokePgBinding => ({
    uploadId: scenario.upload.uploadId,
    adminId,
    clientRequestId: scenario.request.clientRequestId,
    promotionId,
    sourceObjectKey: scenario.pending.sourceObjectKey,
    destinationObjectKey: scenario.pending.destinationObjectKey,
    releaseFingerprint: environment.release.releaseFingerprint,
    runStartedAt: context.createdAt,
  });

  const prepareFault = async (
    suffix: string,
    conflict: boolean,
    context: SmokeRunContext,
    signal: AbortSignal,
  ): Promise<FaultScenario> => {
    const scenario = await createScenarioUpload(suffix, context, signal);
    await live.proveAllowedCorsPut(scenario.upload, imageBytes, signal);
    const source = await store.head(scenario.pending.sourceObjectKey, signal);
    if (!source) throw new Error('production smoke fault source is absent');
    const promotionId = randomUUID();
    const faultBinding = binding(scenario, context, promotionId);
    await context.recordResource({ kind: 'promotion', id: promotionId });
    await context.recordResource({
      kind: 'object',
      id: `${promotionId}:destination`,
      objectKey: scenario.pending.destinationObjectKey,
    });
    if (conflict) {
      await store.putConflict(scenario.pending.destinationObjectKey, signal);
    } else {
      await store.copyCreateOnly({
        source: scenario.pending.sourceObjectKey,
        destination: scenario.pending.destinationObjectKey,
        sourceEtag: source.etag,
        promotionId,
        sha256: imageSha256,
        bytes: imageBytes.length,
        mime: 'image/webp',
        width: 2,
        height: 2,
        policyVersion: scenario.request.policyVersion,
        signal,
      });
    }
    const destinationBefore = await store.head(
      scenario.pending.destinationObjectKey,
      signal,
    );
    if (!destinationBefore) {
      throw new Error('production smoke fault destination is absent');
    }
    const dispatchedAt = new Date().toISOString();
    await pg.prepareDispatchedPromotion(faultBinding, {
      sourceEtag: source.etag,
      inspectedSha256: imageSha256,
      inspectedByteSize: imageBytes.length,
      canonicalMime: 'image/webp',
      inspectedWidth: 2,
      inspectedHeight: 2,
      accountId: new URL(environment.r2Endpoint).hostname.split('.')[0],
      bucket: environment.r2Bucket,
      leaseToken: randomUUID(),
      dispatchedAt,
      nextReconcileAt: new Date(
        Date.parse(dispatchedAt) + 30_000,
      ).toISOString(),
    });
    return { upload: scenario, binding: faultBinding, destinationBefore };
  };

  async function runCheck(
    check: ProductionSmokeCheck,
    context: SmokeRunContext,
    signal: AbortSignal,
  ): Promise<void> {
    activeContext = context;
    switch (check) {
      case 'browserUpload': {
        const scenario = await createScenarioUpload('browser', context, signal);
        state.normal = scenario;
        state.normalDestination = scenario.pending.destinationObjectKey;
        await live.proveAllowedCorsPut(scenario.upload, imageBytes, signal);
        await live.confirmUpload(scenario.upload.uploadId, signal);
        const terminal = await live.pollUploadTerminal(
          scenario.upload.uploadId,
          Date.now() + 60_000,
          signal,
        );
        if (!terminalConsumed(terminal)) {
          throw new Error('production smoke browser upload did not commit');
        }
        state.normalImageId = String(terminal.resultImageId);
        await context.recordResource({
          kind: 'image',
          id: state.normalImageId,
        });
        return;
      }
      case 'absoluteExpiryRetry':
        await live.proveAbsoluteExpiryRetry(request('expiry-retry'), signal);
        return;
      case 'allowedCorsPut': {
        const scenario = await createScenarioUpload(
          'allowed-cors',
          context,
          signal,
        );
        await live.proveAllowedCorsPut(scenario.upload, imageBytes, signal);
        return;
      }
      case 'deniedCorsPut': {
        const scenario = await createScenarioUpload(
          'denied-cors',
          context,
          signal,
        );
        await live.proveDeniedCorsPut(scenario.upload, imageBytes, signal);
        return;
      }
      case 'responseFirstSettlement': {
        state.responseLoss = await prepareFault(
          'response-loss',
          false,
          context,
          signal,
        );
        const observed = await live.getUploadStatus(
          state.responseLoss.upload.upload.uploadId,
          signal,
        );
        if (observed.outcome !== 'finalizing') {
          throw new Error('production smoke response-first state is invalid');
        }
        return;
      }
      case 'copyResponseLossHeadSettlement': {
        const scenario = state.responseLoss;
        if (!scenario)
          throw new Error('production smoke response-loss state is absent');
        const elapsed =
          Date.now() -
          Date.parse(
            String(
              (await pg.observePromotion(scenario.binding)).copyDispatchedAt ??
                new Date().toISOString(),
            ),
          );
        if (elapsed < 30_000) await wait(30_000 - elapsed, signal);
        const terminal = await live.pollUploadTerminal(
          scenario.upload.upload.uploadId,
          Date.now() + 45_000,
          signal,
        );
        if (!terminalConsumed(terminal)) {
          throw new Error('production smoke response-loss did not settle');
        }
        const promotion = await pg.observePromotion(scenario.binding);
        if (promotion.disposition !== 'committed') {
          throw new Error(
            'production smoke response-loss promotion is not committed',
          );
        }
        state.responseImageId = String(terminal.resultImageId);
        const image = terminal.image as Json | undefined;
        state.responseImageUrl =
          image && typeof image.mediumUrl === 'string'
            ? image.mediumUrl
            : undefined;
        await context.recordResource({
          kind: 'image',
          id: state.responseImageId,
        });
        return;
      }
      case 'unchangedDestinationRetry': {
        const scenario = state.responseLoss;
        if (!scenario)
          throw new Error('production smoke response-loss state is absent');
        await live.proveObjectUnchanged(
          scenario.upload.pending.destinationObjectKey,
          scenario.destinationBefore,
          signal,
        );
        return;
      }
      case 'conflictFailClosed': {
        const scenario = await prepareFault('conflict', true, context, signal);
        const deadline = Date.now() + 45_000;
        let conflict: Json | null = null;
        while (Date.now() < deadline && !conflict) {
          conflict = await pg.observeConflictByPromotion(
            scenario.binding.promotionId,
          );
          if (!conflict) await wait(2_000, signal);
        }
        if (
          !conflict ||
          conflict.state !== 'open' ||
          (await pg.observePromotion(scenario.binding)).disposition ===
            'committed'
        ) {
          throw new Error('production smoke conflict did not fail closed');
        }
        await context.recordResource({
          kind: 'conflict',
          id: String(conflict.id),
        });
        await live.proveObjectUnchanged(
          scenario.upload.pending.destinationObjectKey,
          scenario.destinationBefore,
          signal,
        );
        return;
      }
      case 'committedDeletion': {
        if (!state.normalImageId || !state.normalDestination) {
          throw new Error('production smoke committed image state is absent');
        }
        await live.deleteImage(state.normalImageId, signal);
        const deadline = Date.now() + 45_000;
        let deletion: Json | null = null;
        while (Date.now() < deadline && deletion?.status !== 'deleted') {
          deletion = await pg.observeDeletionByImage(state.normalImageId);
          if (deletion?.status !== 'deleted') await wait(2_000, signal);
        }
        if (!deletion || deletion.status !== 'deleted') {
          throw new Error('production smoke committed deletion did not settle');
        }
        await context.recordResource({
          kind: 'deletion',
          id: String(deletion.id),
        });
        if (await store.head(state.normalDestination, signal)) {
          throw new Error(
            'production smoke committed destination still exists',
          );
        }
        return;
      }
      case 'failedPromotionCleanup': {
        const scenario = await createScenarioUpload(
          'failed-cleanup',
          context,
          signal,
        );
        await live.proveAllowedCorsPut(scenario.upload, imageBytes, signal);
        const source = await store.head(
          scenario.pending.sourceObjectKey,
          signal,
        );
        if (!source) {
          throw new Error('production smoke failed-promotion source is absent');
        }
        const failedBinding = binding(scenario, context);
        await context.recordResource({
          kind: 'promotion',
          id: failedBinding.promotionId,
        });
        const dispatchedAt = new Date().toISOString();
        await pg.prepareDispatchedPromotion(failedBinding, {
          sourceEtag: source.etag,
          inspectedSha256: imageSha256,
          inspectedByteSize: imageBytes.length,
          canonicalMime: 'image/webp',
          inspectedWidth: 2,
          inspectedHeight: 2,
          accountId: new URL(environment.r2Endpoint).hostname.split('.')[0],
          bucket: environment.r2Bucket,
          leaseToken: randomUUID(),
          dispatchedAt,
          nextReconcileAt: new Date(
            Date.parse(dispatchedAt) + 10 * 60_000,
          ).toISOString(),
        });
        await pg.makeFailedCleanupDue(failedBinding);
        const deadline = Date.now() + 45_000;
        let observed: Json | null = null;
        while (Date.now() < deadline) {
          observed = await pg.observeUpload(scenario.upload.uploadId, adminId);
          if (observed?.temporaryCleanupState === 'verified_deleted') break;
          await wait(2_000, signal);
        }
        if (
          observed?.temporaryCleanupState !== 'verified_deleted' ||
          (await store.head(scenario.pending.sourceObjectKey, signal))
        ) {
          throw new Error('production smoke failed cleanup did not settle');
        }
        return;
      }
      case 'temporaryCleanupAfterExpiry': {
        const scenario = await createScenarioUpload(
          'expired-cleanup',
          context,
          signal,
        );
        await live.proveAllowedCorsPut(scenario.upload, imageBytes, signal);
        await pg.makeExpiredPastSkew(binding(scenario, context));
        const deadline = Date.now() + 45_000;
        let observed: Json | null = null;
        while (Date.now() < deadline) {
          observed = await pg.observeUpload(scenario.upload.uploadId, adminId);
          if (observed?.temporaryCleanupState === 'verified_deleted') break;
          await wait(2_000, signal);
        }
        if (
          observed?.temporaryCleanupState !== 'verified_deleted' ||
          (await store.head(scenario.pending.sourceObjectKey, signal))
        ) {
          throw new Error('production smoke expiry cleanup did not settle');
        }
        return;
      }
      case 'imgproxyRendering':
        if (!state.responseImageUrl) {
          throw new Error('production smoke imgproxy URL is absent');
        }
        await live.proveImgproxyRendering(state.responseImageUrl, signal);
        return;
    }
  }

  async function cleanup(
    context: SmokeRunContext,
    signal: AbortSignal,
  ): Promise<void> {
    for (const resource of context.journal().resources) {
      if (resource.kind === 'object' && resource.objectKey) {
        await store.delete(resource.objectKey, signal);
      }
    }
    await pg.cleanup(context.journal());
  }

  return {
    preflight: async (context, signal) => {
      activeContext = context;
      await verifyProtectedAdmission(environment);
      const policy = await live.getUploadPolicy(signal);
      if (typeof policy.policyVersion !== 'string') {
        throw new Error('production smoke policy response is invalid');
      }
      state.policyVersion = policy.policyVersion;
      await pg.assertRateLimitCapacity(adminId, {
        upload_url: 9,
        confirm_upload: 1,
        upload_status: 60,
      });
      const blockedRequest = request('missing-token');
      const response = await fetch(
        new URL('/images/upload-url', environment.apiBaseUrl),
        {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            authorization: `Bearer ${environment.secrets.adminBearerToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(blockedRequest),
        },
      );
      const body = (await response.json().catch(() => ({}))) as Json;
      if (
        response.status !== 403 ||
        body.code !== 'upload_operator_smoke_required' ||
        (await pg.hasClientRequestId(blockedRequest.clientRequestId))
      ) {
        throw new Error(
          'production smoke missing-token canary did not fail closed',
        );
      }
    },
    runCheck,
    cleanup,
    verifyCleanup: async (context, signal) => {
      try {
        await pg.verifyCleanup(context.journal());
        for (const resource of context.journal().resources) {
          if (
            resource.kind === 'object' &&
            resource.objectKey &&
            (await store.head(resource.objectKey, signal))
          ) {
            throw new Error('production smoke R2 cleanup is incomplete');
          }
        }
      } finally {
        await browser?.close();
        await new Promise<void>((resolve) =>
          denied.server.close(() => resolve()),
        );
        store.destroy();
        await pool.end();
      }
    },
    writeReceipt: (context) =>
      writeSmokeReceipt({
        path: environment.paths.receipt,
        authorizationPath: environment.paths.authorization,
        journal: context.journal(),
        receiptId: context.receiptId,
        createdAt: new Date().toISOString(),
      }),
  };
}
