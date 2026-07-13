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
