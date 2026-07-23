import type { SmokeOwnedResource } from './image-upload-production-smoke-contract';

export type ProductionSmokeObjectIdentity = Readonly<{
  etag: string;
  contentLength: number;
  contentType: string;
  metadata: Readonly<Record<string, string>>;
}>;

export type ProductionSmokeUploadInput = Readonly<{
  clientRequestId: string;
  albumId: string;
  filename: string;
  contentType: 'image/webp' | 'image/jpeg' | 'image/png';
  fileSize: number;
  processedSha256: string;
  policyVersion: string;
}>;

export type ProductionSmokeUpload = Readonly<{
  uploadId: string;
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}>;

export type ProductionSmokeBrowserPut = (options: {
  origin: string;
  url: string;
  contentType: string;
  body: Uint8Array;
  signal: AbortSignal;
}) => Promise<Readonly<{ ok: boolean; errorName?: string }>>;

export type ProductionSmokeLiveConfig = Readonly<{
  apiBaseUrl: string;
  imgproxyBaseUrl: string;
  allowedBrowserOrigin: string;
  deniedBrowserOrigin: string;
  adminBearerToken: string;
  smokeToken: string;
  requestTimeoutMs: number;
  pollIntervalMs: number;
}>;

export type ProductionSmokeLiveDependencies = Readonly<{
  browserPut: ProductionSmokeBrowserPut;
  headObject: (
    objectKey: string,
    signal: AbortSignal,
  ) => Promise<ProductionSmokeObjectIdentity | null>;
  decodeImage: (
    bytes: Uint8Array,
  ) => Promise<Readonly<{ width: number; height: number }>>;
  recordResource: (resource: SmokeOwnedResource) => Promise<void>;
  fetchImpl?: typeof fetch;
}>;

type ApiJson = Record<string, unknown>;

function origin(value: string, name: string): URL {
  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.pathname !== '/'
  ) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function objectKeyFromUploadUrl(uploadUrl: string): string {
  const path = decodeURIComponent(new URL(uploadUrl).pathname);
  const offset = path.indexOf('/uploads/');
  if (offset < 0) throw new Error('production smoke upload URL key is invalid');
  const key = path.slice(offset + 1);
  if (!/^uploads\/[^/]+\/[^/]+$/.test(key) || key.includes('..')) {
    throw new Error('production smoke upload URL key is invalid');
  }
  return key;
}

function equalIdentity(
  left: ProductionSmokeObjectIdentity,
  right: ProductionSmokeObjectIdentity,
): boolean {
  const keys = ['sha256', 'bytes', 'width', 'height'] as const;
  return (
    left.etag === right.etag &&
    left.contentLength === right.contentLength &&
    left.contentType === right.contentType &&
    keys.every((key) => left.metadata[key] === right.metadata[key])
  );
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
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

export function createProductionSmokeLiveAdapter(
  config: ProductionSmokeLiveConfig,
  dependencies: ProductionSmokeLiveDependencies,
) {
  const apiOrigin = origin(config.apiBaseUrl, 'apiBaseUrl');
  const imgproxyOrigin = origin(config.imgproxyBaseUrl, 'imgproxyBaseUrl');
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  const resolveApiUrl = (path: string): URL => {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('production smoke API path must be relative');
    }
    const resolved = new URL(path, apiOrigin);
    if (resolved.origin !== apiOrigin.origin) {
      throw new Error('production smoke API origin mismatch');
    }
    return resolved;
  };

  async function apiJson(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<ApiJson> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.requestTimeoutMs,
    );
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetchImpl(resolveApiUrl(path), {
        ...init,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${config.adminBearerToken}`,
          'x-image-upload-smoke-token': config.smokeToken,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
      });
      if (!response.ok) throw new Error('status');
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('shape');
      }
      return value as ApiJson;
    } catch {
      throw new Error('production smoke API request failed');
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }

  async function requestUpload(
    input: ProductionSmokeUploadInput,
    signal: AbortSignal,
  ): Promise<ProductionSmokeUpload> {
    const value = await apiJson('/images/upload-url', signal, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (
      value.outcome !== 'ready' ||
      typeof value.uploadId !== 'string' ||
      typeof value.uploadUrl !== 'string' ||
      typeof value.expiresAt !== 'string'
    ) {
      throw new Error('production smoke upload response is invalid');
    }
    return {
      uploadId: value.uploadId,
      uploadUrl: value.uploadUrl,
      objectKey: objectKeyFromUploadUrl(value.uploadUrl),
      expiresAt: value.expiresAt,
    };
  }

  return Object.freeze({
    resolveApiUrl,

    getUploadPolicy(signal: AbortSignal): Promise<ApiJson> {
      return apiJson('/images/upload-policy', signal);
    },

    async proveAbsoluteExpiryRetry(
      input: ProductionSmokeUploadInput,
      signal: AbortSignal,
    ): Promise<ProductionSmokeUpload> {
      const first = await requestUpload(input, signal);
      const second = await requestUpload(input, signal);
      if (
        first.uploadId !== second.uploadId ||
        first.expiresAt !== second.expiresAt ||
        first.objectKey !== second.objectKey
      ) {
        throw new Error('production smoke absolute expiry retry changed');
      }
      await dependencies.recordResource({ kind: 'upload', id: first.uploadId });
      await dependencies.recordResource({
        kind: 'object',
        id: `${first.uploadId}:source`,
        objectKey: first.objectKey,
      });
      return first;
    },

    async proveAllowedCorsPut(
      upload: ProductionSmokeUpload,
      body: Uint8Array,
      signal: AbortSignal,
    ): Promise<ProductionSmokeObjectIdentity> {
      let result: Awaited<ReturnType<ProductionSmokeBrowserPut>>;
      try {
        result = await dependencies.browserPut({
          origin: config.allowedBrowserOrigin,
          url: upload.uploadUrl,
          contentType: 'image/webp',
          body,
          signal,
        });
      } catch {
        throw new Error('production smoke browser PUT failed');
      }
      if (!result.ok) throw new Error('production smoke allowed CORS failed');
      const observed = await dependencies.headObject(upload.objectKey, signal);
      if (!observed) throw new Error('production smoke allowed PUT is absent');
      return observed;
    },

    async proveDeniedCorsPut(
      upload: ProductionSmokeUpload,
      body: Uint8Array,
      signal: AbortSignal,
    ): Promise<void> {
      let result: Awaited<ReturnType<ProductionSmokeBrowserPut>>;
      try {
        result = await dependencies.browserPut({
          origin: config.deniedBrowserOrigin,
          url: upload.uploadUrl,
          contentType: 'image/webp',
          body,
          signal,
        });
      } catch {
        result = { ok: false, errorName: 'TypeError' };
      }
      if (result.ok || result.errorName !== 'TypeError') {
        throw new Error('production smoke denied CORS was not rejected');
      }
      if (await dependencies.headObject(upload.objectKey, signal)) {
        throw new Error('production smoke denied CORS wrote an object');
      }
    },

    async pollUploadTerminal(
      uploadId: string,
      deadline: number,
      signal: AbortSignal,
    ): Promise<ApiJson> {
      while (Date.now() <= deadline) {
        const value = await apiJson(
          `/images/upload-sessions/${encodeURIComponent(uploadId)}`,
          signal,
        );
        if (
          ['consumed', 'failed', 'gone', 'deleted', 'unavailable'].includes(
            String(value.outcome),
          )
        ) {
          return value;
        }
        await delay(config.pollIntervalMs, signal);
      }
      throw new Error('production smoke upload polling deadline exceeded');
    },

    async proveObjectUnchanged(
      objectKey: string,
      before: ProductionSmokeObjectIdentity,
      signal: AbortSignal,
    ): Promise<ProductionSmokeObjectIdentity> {
      const after = await dependencies.headObject(objectKey, signal);
      if (!after || !equalIdentity(before, after)) {
        throw new Error('production smoke object identity changed');
      }
      return after;
    },

    async proveImgproxyRendering(
      signedUrl: string,
      signal: AbortSignal,
    ): Promise<Readonly<{ width: number; height: number }>> {
      const target = new URL(signedUrl);
      if (target.origin !== imgproxyOrigin.origin) {
        throw new Error('production smoke imgproxy origin mismatch');
      }
      let response: Response;
      try {
        response = await fetchImpl(target, { redirect: 'error', signal });
      } catch {
        throw new Error('production smoke imgproxy request failed');
      }
      if (
        response.status !== 200 ||
        response.headers.get('content-type')?.split(';', 1)[0] !== 'image/webp'
      ) {
        throw new Error('production smoke imgproxy response is invalid');
      }
      const decoded = await dependencies.decodeImage(
        new Uint8Array(await response.arrayBuffer()),
      );
      if (
        !Number.isInteger(decoded.width) ||
        !Number.isInteger(decoded.height) ||
        decoded.width < 1 ||
        decoded.height < 1
      ) {
        throw new Error('production smoke imgproxy dimensions are invalid');
      }
      return decoded;
    },
  });
}
