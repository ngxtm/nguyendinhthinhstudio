import {
  IMAGE_STORAGE_MIGRATION_STATUSES,
  IllegalImageStorageMigrationTransitionError,
  StaleImageStorageMigrationStateError,
  type ImageStorageMigrationJournalRepository,
  type ImageStorageMigrationStatus,
  type ImageStorageMigrationTransitionData,
  transitionImageStorageMigrationStatus,
} from './cloudflare-r2-migration';

type JournalRow = {
  imageId: string;
  status: ImageStorageMigrationStatus;
} & ImageStorageMigrationTransitionData;

class InMemoryMigrationJournal
  implements ImageStorageMigrationJournalRepository
{
  private readonly rows = new Map<string, JournalRow>();

  constructor(rows: JournalRow[]) {
    for (const row of rows) {
      this.rows.set(row.imageId, { ...row });
    }
  }

  async updateMany(
    args: Parameters<ImageStorageMigrationJournalRepository['updateMany']>[0],
  ): Promise<{ count: number }> {
    const row = this.rows.get(args.where.imageId);
    if (!row || row.status !== args.where.status) {
      return { count: 0 };
    }

    this.rows.set(args.where.imageId, { ...row, ...args.data });
    return { count: 1 };
  }

  read(imageId: string): JournalRow | undefined {
    const row = this.rows.get(imageId);
    return row ? { ...row } : undefined;
  }
}

const ALLOWED_TRANSITIONS: ReadonlyArray<
  readonly [ImageStorageMigrationStatus, ImageStorageMigrationStatus]
> = [
  ['pending', 'uploaded'],
  ['uploaded', 'verified'],
  ['pending', 'failed'],
  ['uploaded', 'failed'],
  ['failed', 'uploaded'],
  ['verified', 'cloudflare_deleted'],
  ['pending', 'skipped_deleted'],
  ['uploaded', 'skipped_deleted'],
  ['failed', 'skipped_deleted'],
];

const ILLEGAL_SHORTCUTS_AND_REVERSALS: ReadonlyArray<
  readonly [ImageStorageMigrationStatus, ImageStorageMigrationStatus]
> = [
  ['pending', 'verified'],
  ['pending', 'cloudflare_deleted'],
  ['uploaded', 'pending'],
  ['uploaded', 'cloudflare_deleted'],
  ['verified', 'pending'],
  ['verified', 'uploaded'],
  ['verified', 'failed'],
  ['verified', 'skipped_deleted'],
  ['failed', 'pending'],
  ['failed', 'verified'],
  ['failed', 'cloudflare_deleted'],
];

function createJournal(
  status: ImageStorageMigrationStatus,
  imageId = 'image-1',
): InMemoryMigrationJournal {
  return new InMemoryMigrationJournal([{ imageId, status }]);
}

describe('image storage migration status policy', () => {
  it('exports the complete finite status set', () => {
    expect(IMAGE_STORAGE_MIGRATION_STATUSES).toEqual([
      'pending',
      'uploaded',
      'verified',
      'failed',
      'cloudflare_deleted',
      'skipped_deleted',
    ]);
  });

  it.each(ALLOWED_TRANSITIONS)('allows %s -> %s', async (from, to) => {
    const journal = createJournal(from);

    await transitionImageStorageMigrationStatus(journal, {
      imageId: 'image-1',
      from,
      to,
    });

    expect(journal.read('image-1')).toEqual({
      imageId: 'image-1',
      status: to,
    });
  });

  it.each(ILLEGAL_SHORTCUTS_AND_REVERSALS)(
    'rejects illegal shortcut or reversal %s -> %s',
    async (from, to) => {
      const journal = createJournal(from);

      const transition = transitionImageStorageMigrationStatus(journal, {
        imageId: 'image-1',
        from,
        to,
      });

      await expect(transition).rejects.toBeInstanceOf(
        IllegalImageStorageMigrationTransitionError,
      );
      await expect(transition).rejects.not.toBeInstanceOf(
        StaleImageStorageMigrationStateError,
      );
      expect(journal.read('image-1')?.status).toBe(from);
    },
  );

  it.each(['cloudflare_deleted', 'skipped_deleted'] as const)(
    'treats %s as terminal',
    async (terminalStatus) => {
      for (const targetStatus of IMAGE_STORAGE_MIGRATION_STATUSES) {
        if (targetStatus === terminalStatus) {
          continue;
        }
        const journal = createJournal(terminalStatus);

        await expect(
          transitionImageStorageMigrationStatus(journal, {
            imageId: 'image-1',
            from: terminalStatus,
            to: targetStatus,
          }),
        ).rejects.toBeInstanceOf(IllegalImageStorageMigrationTransitionError);
        expect(journal.read('image-1')?.status).toBe(terminalStatus);
      }
    },
  );

  it.each(IMAGE_STORAGE_MIGRATION_STATUSES)(
    'rejects same-state %s -> %s because resume logic must skip it',
    async (status) => {
      const journal = createJournal(status);

      await expect(
        transitionImageStorageMigrationStatus(journal, {
          imageId: 'image-1',
          from: status,
          to: status,
        }),
      ).rejects.toMatchObject({
        name: 'IllegalImageStorageMigrationTransitionError',
        message:
          'Image storage migration status transitions must change state; resume completed stages instead',
      });
      expect(journal.read('image-1')?.status).toBe(status);
    },
  );

  it('rejects an unknown source status without echoing the supplied value', async () => {
    const journal = createJournal('pending');
    const invalidStatus =
      'private-value-that-must-not-appear' as ImageStorageMigrationStatus;

    const transition = transitionImageStorageMigrationStatus(journal, {
      imageId: 'image-1',
      from: invalidStatus,
      to: 'uploaded',
    });

    await expect(transition).rejects.toMatchObject({
      name: 'IllegalImageStorageMigrationTransitionError',
      message: 'Invalid image storage migration source status',
    });
    await expect(transition).rejects.not.toThrow(invalidStatus);
  });

  it('rejects an unknown target status without echoing the supplied value', async () => {
    const journal = createJournal('pending');
    const invalidStatus =
      'private-value-that-must-not-appear' as ImageStorageMigrationStatus;

    const transition = transitionImageStorageMigrationStatus(journal, {
      imageId: 'image-1',
      from: 'pending',
      to: invalidStatus,
    });

    await expect(transition).rejects.toMatchObject({
      name: 'IllegalImageStorageMigrationTransitionError',
      message: 'Invalid image storage migration target status',
    });
    await expect(transition).rejects.not.toThrow(invalidStatus);
  });

  it('applies optional journal data but never accepts imageId or status overrides', async () => {
    const journal = createJournal('pending');
    const verifiedAt = new Date('2026-07-14T00:00:00.000Z');
    const unsafeData = {
      sourceSize: 1024,
      targetSize: 2048,
      sourceSha256: 'source-sha256',
      targetSha256: 'target-sha256',
      error: null,
      verifiedAt,
      cloudflareDeletedAt: null,
      imageId: 'attacker-controlled-id',
      status: 'failed',
    } as unknown as ImageStorageMigrationTransitionData;

    await transitionImageStorageMigrationStatus(journal, {
      imageId: 'image-1',
      from: 'pending',
      to: 'uploaded',
      data: unsafeData,
    });

    expect(journal.read('image-1')).toEqual({
      imageId: 'image-1',
      status: 'uploaded',
      sourceSize: 1024,
      targetSize: 2048,
      sourceSha256: 'source-sha256',
      targetSha256: 'target-sha256',
      error: null,
      verifiedAt,
      cloudflareDeletedAt: null,
    });
    expect(journal.read('attacker-controlled-id')).toBeUndefined();
  });

  it('reports a stale current-state mismatch when the compare-and-swap matches no row', async () => {
    const journal = createJournal('uploaded');

    const transition = transitionImageStorageMigrationStatus(journal, {
      imageId: 'image-1',
      from: 'pending',
      to: 'uploaded',
    });

    await expect(transition).rejects.toMatchObject({
      name: 'StaleImageStorageMigrationStateError',
      message:
        'Stale image storage migration state: expected pending; conditional transition was not applied',
    });
    await expect(transition).rejects.not.toBeInstanceOf(
      IllegalImageStorageMigrationTransitionError,
    );
    expect(journal.read('image-1')?.status).toBe('uploaded');
  });
});
