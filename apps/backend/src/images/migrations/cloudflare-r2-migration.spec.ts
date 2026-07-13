import {
  buildR2ObjectKey,
  IMAGE_STORAGE_MIGRATION_STATUSES,
  InvalidMigrationOptionsError,
  isLegacyObjectKey,
  IllegalImageStorageMigrationTransitionError,
  parseMigrationOptions,
  runCloudflareR2Migration,
  sanitizeFilename,
  selectEligibleMigrationImages,
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

describe('Cloudflare to R2 migration contract', () => {
  it('accepts legacy Cloudflare IDs with a loose UUID-shaped value', () => {
    expect(isLegacyObjectKey('09389f8a-bd47-409d-f057-c456f492da00')).toBe(
      true,
    );
  });

  it('sanitizes path separators and controls while preserving the extension', () => {
    expect(sanitizeFilename('folder\\nested/\u0000photo final.JPG')).toBe(
      'photo final.JPG',
    );
  });

  it('builds the exact deterministic R2 key from stable image fields', () => {
    const image = {
      id: '00000000-0000-4000-8000-000000000001',
      albumId: '00000000-0000-4000-8000-000000000002',
      filename: 'nested/photo.jpg',
    };

    expect(buildR2ObjectKey(image)).toBe(
      `albums/${image.albumId}/${image.id}-photo.jpg`,
    );
  });

  it('parses dry-run mode with safe defaults', () => {
    expect(parseMigrationOptions(['--dry-run'])).toEqual({
      mode: 'dry-run',
      concurrency: 1,
    });
  });

  it('parses execute filters and bounded numeric options', () => {
    const albumId = '00000000-0000-4000-8000-000000000001';
    const resumeAfter = '00000000-0000-4000-8000-000000000002';

    expect(
      parseMigrationOptions([
        '--execute',
        '--limit=5',
        '--concurrency=2',
        `--album-id=${albumId}`,
        `--resume-after=${resumeAfter}`,
      ]),
    ).toEqual({
      mode: 'execute',
      limit: 5,
      concurrency: 2,
      albumId,
      resumeAfter,
    });
  });

  it.each([
    { argv: [] },
    { argv: ['--dry-run', '--execute'] },
    { argv: ['--execute', '--limit=0'] },
    { argv: ['--execute', '--limit=1.5'] },
    { argv: ['--execute', '--concurrency=0'] },
    { argv: ['--execute', '--concurrency=6'] },
    { argv: ['--execute', '--album-id=not-a-uuid'] },
    { argv: ['--execute', '--resume-after=not-a-uuid'] },
    { argv: ['--execute', '--limit=1', '--limit=2'] },
    { argv: ['--execute', '--unknown=value'] },
    { argv: ['--execute', 'positional'] },
  ])('rejects unsafe or ambiguous arguments: $argv', ({ argv }) => {
    expect(() => parseMigrationOptions(argv)).toThrow(
      InvalidMigrationOptionsError,
    );
  });

  it('does not classify R2 keys or malformed strings as legacy IDs', () => {
    expect(isLegacyObjectKey('albums/a/image.jpg')).toBe(false);
    expect(isLegacyObjectKey('not-a-cloudflare-id')).toBe(false);
    expect(isLegacyObjectKey(null)).toBe(false);
  });

  it('uses a deterministic non-empty fallback for an empty basename', () => {
    expect(sanitizeFilename('folder/\u0000\u001f')).toBe('image');
  });

  it('selects only ordered legacy records before applying the limit', () => {
    const albumId = '00000000-0000-4000-8000-000000000010';
    const otherAlbumId = '00000000-0000-4000-8000-000000000020';
    const resumeAfter = '00000000-0000-4000-8000-000000000001';
    const legacyOne = '09389f8a-bd47-409d-f057-c456f492da00';
    const legacyTwo = 'be5b07b5-3a85-48f7-af0c-8e8a778b7f00';
    const rows = [
      {
        id: '00000000-0000-4000-8000-000000000004',
        albumId,
        filename: 'second.jpg',
        r2ObjectKey: legacyTwo,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        albumId,
        filename: 'first.jpg',
        r2ObjectKey: legacyOne,
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        albumId,
        filename: 'already-r2.jpg',
        r2ObjectKey: `albums/${albumId}/already-r2.jpg`,
      },
      {
        id: '00000000-0000-4000-8000-000000000005',
        albumId: otherAlbumId,
        filename: 'other.jpg',
        r2ObjectKey: legacyTwo.toUpperCase(),
      },
      {
        id: '00000000-0000-4000-8000-000000000006',
        albumId,
        filename: 'malformed.jpg',
        r2ObjectKey: 'unexpected-value',
      },
    ];

    expect(
      selectEligibleMigrationImages(rows, {
        mode: 'dry-run',
        concurrency: 1,
        limit: 1,
        albumId,
        resumeAfter,
      }),
    ).toEqual([rows[1]]);
  });

  it('returns a read-only dry-run summary without an execution dependency', async () => {
    let reads = 0;
    const images = {
      async findMany() {
        reads += 1;
        return [
          {
            id: '00000000-0000-4000-8000-000000000001',
            albumId: '00000000-0000-4000-8000-000000000010',
            filename: 'legacy.jpg',
            r2ObjectKey: '09389f8a-bd47-409d-f057-c456f492da00',
          },
          {
            id: '00000000-0000-4000-8000-000000000002',
            albumId: '00000000-0000-4000-8000-000000000010',
            filename: 'new.jpg',
            r2ObjectKey: 'albums/00000000-0000-4000-8000-000000000010/new.jpg',
          },
        ];
      },
    };

    await expect(
      runCloudflareR2Migration({ mode: 'dry-run', concurrency: 1 }, { images }),
    ).resolves.toEqual({
      eligible: 1,
      migrated: 0,
      skipped: 0,
      failed: 0,
      mode: 'dry-run',
    });
    expect(reads).toBe(1);
  });
});
