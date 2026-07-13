import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const LEGACY_CLOUDFLARE_IMAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLegacyObjectKey(value: unknown): value is string {
  return (
    typeof value === 'string' && LEGACY_CLOUDFLARE_IMAGE_ID_PATTERN.test(value)
  );
}

export function sanitizeFilename(filename: string): string {
  const basename = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  const sanitized = basename.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return sanitized || 'image';
}

export type MigrationImageIdentity = {
  id: string;
  albumId: string;
  filename: string;
};

export function buildR2ObjectKey(image: MigrationImageIdentity): string {
  return `albums/${image.albumId}/${image.id}-${sanitizeFilename(image.filename)}`;
}

export type MigrationMode = 'dry-run' | 'execute';

export type MigrationOptions = {
  mode: MigrationMode;
  concurrency: number;
  limit?: number;
  albumId?: string;
  resumeAfter?: string;
};

export type MigrationImage = MigrationImageIdentity & {
  r2ObjectKey: string | null;
};

export function selectEligibleMigrationImages<T extends MigrationImage>(
  images: readonly T[],
  options: MigrationOptions,
): T[] {
  const eligible = images
    .filter(
      (image) =>
        isLegacyObjectKey(image.r2ObjectKey) &&
        (options.albumId === undefined || image.albumId === options.albumId) &&
        (options.resumeAfter === undefined || image.id > options.resumeAfter),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  return options.limit === undefined
    ? eligible
    : eligible.slice(0, options.limit);
}

export type MigrationImageFindManyArgs = {
  where: {
    uploadStatus: 'completed';
    r2ObjectKey: { not: null };
    albumId?: string;
    id?: { gt: string };
  };
  orderBy: { id: 'asc' };
  select: {
    id: true;
    albumId: true;
    filename: true;
    r2ObjectKey: true;
  };
};

export interface MigrationImageReader {
  findMany(args: MigrationImageFindManyArgs): Promise<MigrationImage[]>;
}

export type MigrationSummary = {
  eligible: number;
  migrated: number;
  skipped: number;
  failed: number;
  mode: MigrationMode;
};

export type MigrationRunDependencies = {
  images: MigrationImageReader;
  migrateOne?: (
    image: MigrationImage & { r2ObjectKey: string },
  ) => Promise<'migrated' | 'skipped'>;
};

export class MigrationExecutionUnavailableError extends Error {
  constructor() {
    super('Execute mode requires the Cloudflare to R2 image pipeline');
    this.name = 'MigrationExecutionUnavailableError';
  }
}

async function findEligibleMigrationImages(
  images: MigrationImageReader,
  options: MigrationOptions,
): Promise<Array<MigrationImage & { r2ObjectKey: string }>> {
  const rows = await images.findMany({
    where: {
      uploadStatus: 'completed',
      r2ObjectKey: { not: null },
      ...(options.albumId !== undefined ? { albumId: options.albumId } : {}),
      ...(options.resumeAfter !== undefined
        ? { id: { gt: options.resumeAfter } }
        : {}),
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      albumId: true,
      filename: true,
      r2ObjectKey: true,
    },
  });

  return selectEligibleMigrationImages(rows, options) as Array<
    MigrationImage & { r2ObjectKey: string }
  >;
}

export async function runCloudflareR2Migration(
  options: MigrationOptions,
  dependencies: MigrationRunDependencies,
): Promise<MigrationSummary> {
  const eligible = await findEligibleMigrationImages(
    dependencies.images,
    options,
  );
  const summary: MigrationSummary = {
    eligible: eligible.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
    mode: options.mode,
  };

  if (options.mode === 'dry-run') {
    return summary;
  }
  const migrateOne = dependencies.migrateOne;
  if (!migrateOne) {
    throw new MigrationExecutionUnavailableError();
  }

  let cursor = 0;
  let fatalConflict: ImageStorageMigrationConflictError | undefined;
  const workerCount = Math.min(options.concurrency, eligible.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!fatalConflict) {
      const image = eligible[cursor++];
      if (!image) return;

      try {
        const outcome = await migrateOne(image);
        summary[outcome] += 1;
      } catch (error) {
        summary.failed += 1;
        if (error instanceof ImageStorageMigrationConflictError) {
          fatalConflict ??= error;
          return;
        }
      }
    }
  });

  await Promise.all(workers);
  if (fatalConflict) {
    throw fatalConflict;
  }
  return summary;
}

export class InvalidMigrationOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMigrationOptionsError';
  }
}

const STRICT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBoundedInteger(
  value: string,
  option: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidMigrationOptionsError(
      `${option} must be a positive integer`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new InvalidMigrationOptionsError(`${option} is out of range`);
  }
  return parsed;
}

function parseStrictUuid(value: string, option: string): string {
  if (!STRICT_UUID_PATTERN.test(value)) {
    throw new InvalidMigrationOptionsError(`${option} must be a UUID`);
  }
  return value;
}

export function parseMigrationOptions(
  argv: readonly string[],
): MigrationOptions {
  let mode: MigrationMode | undefined;
  let limit: number | undefined;
  let concurrency = 1;
  let albumId: string | undefined;
  let resumeAfter: string | undefined;
  const seen = new Set<string>();

  for (const argument of argv) {
    if (argument === '--dry-run' || argument === '--execute') {
      const key = argument.slice(2);
      if (seen.has(key) || mode !== undefined) {
        throw new InvalidMigrationOptionsError(
          'Specify exactly one migration mode',
        );
      }
      seen.add(key);
      mode = argument === '--dry-run' ? 'dry-run' : 'execute';
      continue;
    }

    const option = /^--([^=]+)=(.*)$/.exec(argument);
    if (!option || option[2] === '') {
      throw new InvalidMigrationOptionsError('Malformed migration option');
    }
    const [, key, value] = option;
    if (seen.has(key)) {
      throw new InvalidMigrationOptionsError(
        'Duplicate migration options are not allowed',
      );
    }
    seen.add(key);

    switch (key) {
      case 'limit':
        limit = parseBoundedInteger(value, '--limit');
        break;
      case 'concurrency':
        concurrency = parseBoundedInteger(value, '--concurrency', 5);
        break;
      case 'album-id':
        albumId = parseStrictUuid(value, '--album-id');
        break;
      case 'resume-after':
        resumeAfter = parseStrictUuid(value, '--resume-after');
        break;
      default:
        throw new InvalidMigrationOptionsError('Unknown migration option');
    }
  }

  if (!mode) {
    throw new InvalidMigrationOptionsError(
      'Specify exactly one migration mode',
    );
  }

  return {
    mode,
    concurrency,
    ...(limit !== undefined ? { limit } : {}),
    ...(albumId !== undefined ? { albumId } : {}),
    ...(resumeAfter !== undefined ? { resumeAfter } : {}),
  };
}

export const IMAGE_STORAGE_MIGRATION_STATUSES = [
  'pending',
  'uploaded',
  'verified',
  'failed',
  'cloudflare_deleted',
  'skipped_deleted',
] as const;

export type ImageStorageMigrationStatus =
  (typeof IMAGE_STORAGE_MIGRATION_STATUSES)[number];

export type ImageStorageMigrationTransitionData = Readonly<{
  sourceSize?: number | null;
  targetSize?: number | null;
  sourceSha256?: string | null;
  targetSha256?: string | null;
  error?: string | null;
  verifiedAt?: Date | null;
  cloudflareDeletedAt?: Date | null;
}>;

type ImageStorageMigrationUpdateData = ImageStorageMigrationTransitionData & {
  status: ImageStorageMigrationStatus;
};

export interface ImageStorageMigrationJournalRepository {
  updateMany(args: {
    where: {
      imageId: string;
      status: ImageStorageMigrationStatus;
    };
    data: ImageStorageMigrationUpdateData;
  }): Promise<{ count: number }>;
}

export type ImageStorageMigrationTransition = {
  imageId: string;
  from: ImageStorageMigrationStatus;
  to: ImageStorageMigrationStatus;
  data?: ImageStorageMigrationTransitionData;
};

export class IllegalImageStorageMigrationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalImageStorageMigrationTransitionError';
  }
}

export class StaleImageStorageMigrationStateError extends Error {
  constructor(expectedStatus: ImageStorageMigrationStatus) {
    super(
      `Stale image storage migration state: expected ${expectedStatus}; conditional transition was not applied`,
    );
    this.name = 'StaleImageStorageMigrationStateError';
  }
}

const STATUS_SET = new Set<string>(IMAGE_STORAGE_MIGRATION_STATUSES);

const ALLOWED_TRANSITIONS: Readonly<
  Record<ImageStorageMigrationStatus, ReadonlySet<ImageStorageMigrationStatus>>
> = {
  pending: new Set(['uploaded', 'failed', 'skipped_deleted']),
  uploaded: new Set(['verified', 'failed', 'skipped_deleted']),
  verified: new Set(['cloudflare_deleted']),
  failed: new Set(['uploaded', 'skipped_deleted']),
  cloudflare_deleted: new Set(),
  skipped_deleted: new Set(),
};

export function isImageStorageMigrationStatus(
  value: unknown,
): value is ImageStorageMigrationStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

function assertStatus(
  value: unknown,
  position: 'source' | 'target',
): asserts value is ImageStorageMigrationStatus {
  if (!isImageStorageMigrationStatus(value)) {
    throw new IllegalImageStorageMigrationTransitionError(
      `Invalid image storage migration ${position} status`,
    );
  }
}

function buildUpdateData(
  status: ImageStorageMigrationStatus,
  data: ImageStorageMigrationTransitionData | undefined,
): ImageStorageMigrationUpdateData {
  return {
    status,
    ...(data?.sourceSize !== undefined ? { sourceSize: data.sourceSize } : {}),
    ...(data?.targetSize !== undefined ? { targetSize: data.targetSize } : {}),
    ...(data?.sourceSha256 !== undefined
      ? { sourceSha256: data.sourceSha256 }
      : {}),
    ...(data?.targetSha256 !== undefined
      ? { targetSha256: data.targetSha256 }
      : {}),
    ...(data?.error !== undefined ? { error: data.error } : {}),
    ...(data?.verifiedAt !== undefined ? { verifiedAt: data.verifiedAt } : {}),
    ...(data?.cloudflareDeletedAt !== undefined
      ? { cloudflareDeletedAt: data.cloudflareDeletedAt }
      : {}),
  };
}

export async function transitionImageStorageMigrationStatus(
  journal: ImageStorageMigrationJournalRepository,
  transition: ImageStorageMigrationTransition,
): Promise<void> {
  assertStatus(transition.from, 'source');
  assertStatus(transition.to, 'target');

  if (transition.from === transition.to) {
    throw new IllegalImageStorageMigrationTransitionError(
      'Image storage migration status transitions must change state; resume completed stages instead',
    );
  }

  if (!ALLOWED_TRANSITIONS[transition.from].has(transition.to)) {
    throw new IllegalImageStorageMigrationTransitionError(
      `Illegal image storage migration status transition: ${transition.from} -> ${transition.to}`,
    );
  }

  const result = await journal.updateMany({
    where: {
      imageId: transition.imageId,
      status: transition.from,
    },
    data: buildUpdateData(transition.to, transition.data),
  });

  if (result.count !== 1) {
    throw new StaleImageStorageMigrationStateError(transition.from);
  }
}

export type ImageStorageMigrationJournalRow = {
  imageId: string;
  legacyCloudflareImageId: string;
  targetR2ObjectKey: string;
  status: string;
  sourceSize: number | null;
  targetSize: number | null;
  sourceSha256: string | null;
  targetSha256: string | null;
  error: string | null;
  verifiedAt: Date | null;
  cloudflareDeletedAt: Date | null;
};

export interface ImageStorageMigrationPipelineJournal
  extends ImageStorageMigrationJournalRepository {
  findUnique(args: {
    where: { imageId: string };
  }): Promise<ImageStorageMigrationJournalRow | null>;
  create(args: {
    data: {
      imageId: string;
      legacyCloudflareImageId: string;
      targetR2ObjectKey: string;
    };
  }): Promise<ImageStorageMigrationJournalRow>;
}

export interface ImageStorageMigrationPipelineImages {
  findUnique(args: { where: { id: string } }): Promise<MigrationImage | null>;
  updateMany(args: {
    where: { id: string; r2ObjectKey: string };
    data: { r2ObjectKey: string };
  }): Promise<{ count: number }>;
}

export interface MigrationImageObjectDeletionQueue {
  upsert(args: {
    where: {
      provider_objectKey: {
        provider: 'r2';
        objectKey: string;
      };
    };
    create: {
      imageId: string;
      provider: 'r2';
      objectKey: string;
      status: 'pending';
    };
    update: {
      status: 'pending';
      deletedAt: null;
      lastError: null;
    };
  }): Promise<unknown>;
}

export type ImageStorageMigrationTransaction = {
  imageStorageMigration: ImageStorageMigrationPipelineJournal;
  image: ImageStorageMigrationPipelineImages;
  imageObjectDeletion: MigrationImageObjectDeletionQueue;
};

export interface ImageStorageMigrationDatabase
  extends ImageStorageMigrationTransaction {
  $transaction<T>(
    work: (transaction: ImageStorageMigrationTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface MigrationObjectStore {
  send(command: unknown): Promise<unknown>;
}

export interface MigrationImageUrls {
  getVariantUrls(objectKey: string): { mediumUrl: string };
}

export type OneImageMigrationDependencies = {
  database: ImageStorageMigrationDatabase;
  r2: MigrationObjectStore;
  bucket: string;
  accountId: string;
  readToken: string;
  imageUrls: MigrationImageUrls;
  fetch?: typeof fetch;
  tempRoot?: string;
  now?: () => Date;
};

type DownloadedOriginal = {
  path: string;
  contentType: string;
  size: number;
  sha256: string;
};

type VerifiedObject = {
  size: number;
  sha256: string;
};

export class ImageStorageMigrationConflictError extends Error {
  constructor(message = 'Image changed during migration') {
    super(message);
    this.name = 'ImageStorageMigrationConflictError';
  }
}

class ImageChangedDuringMigrationError extends Error {
  constructor() {
    super('Image changed during migration');
    this.name = 'ImageChangedDuringMigrationError';
  }
}

function normalizeContentType(value: string | null | undefined): string {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase();
}

function sanitizedMigrationError(error: unknown, secret: string): string {
  const raw = error instanceof Error ? error.message : 'Image migration failed';
  const redacted = secret ? raw.split(secret).join('[REDACTED]') : raw;
  return redacted.slice(0, 2000);
}

function sanitizedMigrationFailure(error: unknown, secret: string): Error {
  const message = sanitizedMigrationError(error, secret);
  return error instanceof ImageStorageMigrationConflictError
    ? new ImageStorageMigrationConflictError(message)
    : new Error(message);
}

async function downloadCloudflareOriginal(
  legacyCloudflareImageId: string,
  targetPath: string,
  dependencies: OneImageMigrationDependencies,
): Promise<DownloadedOriginal> {
  const fetchImpl = dependencies.fetch ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    dependencies.accountId,
  )}/images/v1/${encodeURIComponent(legacyCloudflareImageId)}/blob`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${dependencies.readToken}`,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Cloudflare image download failed with HTTP ${response.status}`,
    );
  }
  const contentType = normalizeContentType(
    response.headers.get('content-type'),
  );
  if (!contentType.startsWith('image/')) {
    await response.body?.cancel();
    throw new Error('Cloudflare original content type is not an image');
  }
  if (!response.body) {
    throw new Error('Cloudflare original response body is missing');
  }

  const hash = createHash('sha256');
  let size = 0;
  const meter = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      hash.update(bytes);
      callback(null, bytes);
    },
  });
  await pipeline(
    Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
    meter,
    createWriteStream(targetPath, { mode: 0o600 }),
  );
  if (size === 0) {
    throw new Error('Cloudflare original is empty');
  }

  return {
    path: targetPath,
    contentType,
    size,
    sha256: hash.digest('hex'),
  };
}

async function uploadOriginalToR2(
  original: DownloadedOriginal,
  legacyCloudflareImageId: string,
  targetR2ObjectKey: string,
  dependencies: OneImageMigrationDependencies,
): Promise<void> {
  await dependencies.r2.send(
    new PutObjectCommand({
      Bucket: dependencies.bucket,
      Key: targetR2ObjectKey,
      Body: createReadStream(original.path),
      ContentType: original.contentType,
      ContentLength: original.size,
      Metadata: {
        'legacy-cloudflare-id': legacyCloudflareImageId,
        'source-sha256': original.sha256,
      },
    }),
  );
}

async function hashObjectBody(body: unknown): Promise<VerifiedObject> {
  if (
    !body ||
    typeof (body as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] !== 'function'
  ) {
    throw new Error('R2 GetObject response body is not streamable');
  }

  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest('hex') };
}

async function verifyR2Object(
  original: DownloadedOriginal,
  legacyCloudflareImageId: string,
  targetR2ObjectKey: string,
  dependencies: OneImageMigrationDependencies,
): Promise<VerifiedObject> {
  const head = (await dependencies.r2.send(
    new HeadObjectCommand({
      Bucket: dependencies.bucket,
      Key: targetR2ObjectKey,
    }),
  )) as {
    ContentLength?: number;
    ContentType?: string;
    Metadata?: Record<string, string>;
  };

  if (head.ContentLength !== original.size) {
    throw new Error('R2 object size does not match Cloudflare original');
  }
  if (normalizeContentType(head.ContentType) !== original.contentType) {
    throw new Error(
      'R2 object content type does not match Cloudflare original',
    );
  }
  if (
    head.Metadata?.['legacy-cloudflare-id'] !== legacyCloudflareImageId ||
    head.Metadata?.['source-sha256'] !== original.sha256
  ) {
    throw new Error('R2 object migration metadata does not match source');
  }

  const result = (await dependencies.r2.send(
    new GetObjectCommand({
      Bucket: dependencies.bucket,
      Key: targetR2ObjectKey,
    }),
  )) as { Body?: unknown };
  const verified = await hashObjectBody(result.Body);
  if (verified.size !== original.size) {
    throw new Error('R2 object byte count does not match Cloudflare original');
  }
  if (verified.sha256 !== original.sha256) {
    throw new Error('R2 object SHA-256 does not match Cloudflare original');
  }
  return verified;
}

async function verifyImgproxyVariant(
  targetR2ObjectKey: string,
  dependencies: OneImageMigrationDependencies,
): Promise<void> {
  const mediumUrl =
    dependencies.imageUrls.getVariantUrls(targetR2ObjectKey).mediumUrl;
  const response = await (dependencies.fetch ?? fetch)(mediumUrl);
  const contentType = normalizeContentType(
    response.headers.get('content-type'),
  );
  const contentLength = Number(response.headers.get('content-length'));

  if (
    response.status !== 200 ||
    !contentType.startsWith('image/') ||
    !Number.isFinite(contentLength) ||
    contentLength <= 0
  ) {
    await response.body?.cancel();
    throw new Error('Imgproxy verification failed');
  }
  await response.body?.cancel();
}

async function getOrCreateMigrationJournal(
  image: MigrationImage & { r2ObjectKey: string },
  database: ImageStorageMigrationDatabase,
): Promise<
  ImageStorageMigrationJournalRow & { status: ImageStorageMigrationStatus }
> {
  const existing = await database.imageStorageMigration.findUnique({
    where: { imageId: image.id },
  });
  const row =
    existing ??
    (await database.imageStorageMigration.create({
      data: {
        imageId: image.id,
        legacyCloudflareImageId: image.r2ObjectKey,
        targetR2ObjectKey: buildR2ObjectKey(image),
      },
    }));

  if (
    row.legacyCloudflareImageId !== image.r2ObjectKey ||
    !isImageStorageMigrationStatus(row.status)
  ) {
    throw new ImageStorageMigrationConflictError(
      'Migration journal does not match the selected image',
    );
  }
  return row as ImageStorageMigrationJournalRow & {
    status: ImageStorageMigrationStatus;
  };
}

async function recordMigrationFailure(
  journal: ImageStorageMigrationJournalRow & {
    status: ImageStorageMigrationStatus;
  },
  error: unknown,
  dependencies: OneImageMigrationDependencies,
): Promise<void> {
  const message = sanitizedMigrationError(error, dependencies.readToken);
  try {
    if (journal.status === 'pending' || journal.status === 'uploaded') {
      await transitionImageStorageMigrationStatus(
        dependencies.database.imageStorageMigration,
        {
          imageId: journal.imageId,
          from: journal.status,
          to: 'failed',
          data: { error: message },
        },
      );
      journal.status = 'failed';
      journal.error = message;
      return;
    }
    if (journal.status === 'failed') {
      await dependencies.database.imageStorageMigration.updateMany({
        where: { imageId: journal.imageId, status: 'failed' },
        data: { status: 'failed', error: message },
      });
      journal.error = message;
    }
  } catch {
    // Preserve the original migration failure; a stale journal is reconciled
    // by the operator instead of hiding the source error.
  }
}

async function queueTargetCleanup(
  imageId: string,
  targetR2ObjectKey: string,
  queue: MigrationImageObjectDeletionQueue,
): Promise<void> {
  await queue.upsert({
    where: {
      provider_objectKey: {
        provider: 'r2',
        objectKey: targetR2ObjectKey,
      },
    },
    create: {
      imageId,
      provider: 'r2',
      objectKey: targetR2ObjectKey,
      status: 'pending',
    },
    update: {
      status: 'pending',
      deletedAt: null,
      lastError: null,
    },
  });
}

async function cleanupChangedImage(
  image: MigrationImage & { r2ObjectKey: string },
  journal: ImageStorageMigrationJournalRow & {
    status: ImageStorageMigrationStatus;
  },
  dependencies: OneImageMigrationDependencies,
): Promise<'skipped'> {
  const conflict = new ImageStorageMigrationConflictError();
  const conflictMessage = sanitizedMigrationError(
    conflict,
    dependencies.readToken,
  );
  const current = await dependencies.database.$transaction(
    async (transaction) => {
      const persisted = await transaction.image.findUnique({
        where: { id: image.id },
      });
      await queueTargetCleanup(
        image.id,
        journal.targetR2ObjectKey,
        transaction.imageObjectDeletion,
      );
      await transitionImageStorageMigrationStatus(
        transaction.imageStorageMigration,
        {
          imageId: image.id,
          from: journal.status,
          to: persisted ? 'failed' : 'skipped_deleted',
          data: { error: persisted ? conflictMessage : null },
        },
      );
      return persisted;
    },
  );

  if (current) {
    journal.status = 'failed';
    journal.error = conflictMessage;
  } else {
    journal.status = 'skipped_deleted';
    journal.error = null;
  }

  try {
    await dependencies.r2.send(
      new DeleteObjectCommand({
        Bucket: dependencies.bucket,
        Key: journal.targetR2ObjectKey,
      }),
    );
  } catch {
    // The durable ImageObjectDeletion row remains pending for the retry worker.
  }

  if (!current) {
    return 'skipped';
  }
  throw conflict;
}

async function removeMigrationTemporaryDirectory(
  directory: string,
  suppressFailure: boolean,
): Promise<void> {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if (!suppressFailure) {
      throw error;
    }
  }
}

export async function migrateOneImage(
  image: MigrationImage & { r2ObjectKey: string },
  dependencies: OneImageMigrationDependencies,
): Promise<'migrated' | 'skipped'> {
  if (!isLegacyObjectKey(image.r2ObjectKey)) {
    throw new ImageStorageMigrationConflictError(
      'Selected image does not contain a legacy Cloudflare ID',
    );
  }

  const journal = await getOrCreateMigrationJournal(
    image,
    dependencies.database,
  );
  if (journal.status === 'skipped_deleted') {
    return 'skipped';
  }
  if (
    journal.status === 'verified' ||
    journal.status === 'cloudflare_deleted'
  ) {
    throw new ImageStorageMigrationConflictError(
      'Terminal migration journal conflicts with a legacy image row',
    );
  }

  const directory = await mkdtemp(
    join(dependencies.tempRoot ?? tmpdir(), 'cloudflare-r2-'),
  );
  const targetPath = join(directory, 'source');
  let hasPrimaryFailure = false;

  try {
    const original = await downloadCloudflareOriginal(
      journal.legacyCloudflareImageId,
      targetPath,
      dependencies,
    );

    if (journal.status === 'pending' || journal.status === 'failed') {
      await uploadOriginalToR2(
        original,
        journal.legacyCloudflareImageId,
        journal.targetR2ObjectKey,
        dependencies,
      );
      const from = journal.status;
      await transitionImageStorageMigrationStatus(
        dependencies.database.imageStorageMigration,
        {
          imageId: image.id,
          from,
          to: 'uploaded',
          data: {
            sourceSize: original.size,
            sourceSha256: original.sha256,
            error: null,
          },
        },
      );
      journal.status = 'uploaded';
      journal.sourceSize = original.size;
      journal.sourceSha256 = original.sha256;
      journal.error = null;
    } else if (
      journal.sourceSize !== original.size ||
      journal.sourceSha256 !== original.sha256
    ) {
      throw new ImageStorageMigrationConflictError(
        'Uploaded journal source metadata no longer matches Cloudflare',
      );
    }

    const target = await verifyR2Object(
      original,
      journal.legacyCloudflareImageId,
      journal.targetR2ObjectKey,
      dependencies,
    );
    await verifyImgproxyVariant(journal.targetR2ObjectKey, dependencies);

    try {
      await dependencies.database.$transaction(async (transaction) => {
        await transitionImageStorageMigrationStatus(
          transaction.imageStorageMigration,
          {
            imageId: image.id,
            from: 'uploaded',
            to: 'verified',
            data: {
              targetSize: target.size,
              sourceSha256: original.sha256,
              targetSha256: target.sha256,
              verifiedAt: (dependencies.now ?? (() => new Date()))(),
              error: null,
            },
          },
        );
        const updated = await transaction.image.updateMany({
          where: {
            id: image.id,
            r2ObjectKey: journal.legacyCloudflareImageId,
          },
          data: { r2ObjectKey: journal.targetR2ObjectKey },
        });
        if (updated.count !== 1) {
          throw new ImageChangedDuringMigrationError();
        }
      });
    } catch (error) {
      if (error instanceof ImageChangedDuringMigrationError) {
        return await cleanupChangedImage(image, journal, dependencies);
      }
      throw error;
    }

    journal.status = 'verified';
    journal.targetSize = target.size;
    journal.targetSha256 = target.sha256;
    journal.verifiedAt = (dependencies.now ?? (() => new Date()))();
    return 'migrated';
  } catch (error) {
    hasPrimaryFailure = true;
    await recordMigrationFailure(journal, error, dependencies);
    throw sanitizedMigrationFailure(error, dependencies.readToken);
  } finally {
    await removeMigrationTemporaryDirectory(directory, hasPrimaryFailure);
  }
}
