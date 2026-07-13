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
  if (!dependencies.migrateOne) {
    throw new MigrationExecutionUnavailableError();
  }

  for (const image of eligible) {
    try {
      const outcome = await dependencies.migrateOne(image);
      summary[outcome] += 1;
    } catch {
      summary.failed += 1;
    }
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
