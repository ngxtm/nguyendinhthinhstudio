import {
  ImageStorageMigrationConflictError,
  runCloudflareR2Migration,
  type MigrationImage,
} from './cloudflare-r2-migration';

const ALBUM_ID = '00000000-0000-4000-8000-000000000100';

function migrationImage(index: number): MigrationImage & {
  r2ObjectKey: string;
} {
  const suffix = String(index + 1).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    albumId: ALBUM_ID,
    filename: `image-${index + 1}.jpg`,
    r2ObjectKey: `10000000-0000-0000-0000-${suffix}`,
  };
}

function createReader(rows: MigrationImage[]) {
  return {
    findMany() {
      return Promise.resolve(rows.map((row) => ({ ...row })));
    },
  };
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('Cloudflare to R2 migration runner', () => {
  it('runs no more than the requested number of images concurrently', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => migrationImage(index));
    const gates = rows.map(() => deferred());
    const started: number[] = [];
    let active = 0;
    let maximumActive = 0;

    const migration = runCloudflareR2Migration(
      { mode: 'execute', concurrency: 3 },
      {
        images: createReader(rows),
        migrateOne: async (image) => {
          const index = rows.findIndex((row) => row.id === image.id);
          started.push(index);
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await gates[index].promise;
          active -= 1;
          return 'migrated';
        },
      },
    );

    await nextEventLoopTurn();
    const firstWave = [...started];
    for (const gate of gates) gate.resolve();

    await expect(migration).resolves.toEqual({
      eligible: 5,
      migrated: 5,
      skipped: 0,
      failed: 0,
      mode: 'execute',
    });
    expect(firstWave).toHaveLength(3);
    expect(maximumActive).toBe(3);
  });

  it('summarizes migrated, skipped, and non-fatal failures', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => migrationImage(index));

    await expect(
      runCloudflareR2Migration(
        { mode: 'execute', concurrency: 2 },
        {
          images: createReader(rows),
          migrateOne: (image) => {
            const index = rows.findIndex((row) => row.id === image.id);
            if (index === 1) return Promise.resolve('skipped' as const);
            if (index === 2) {
              return Promise.reject(new Error('transient download failure'));
            }
            return Promise.resolve('migrated' as const);
          },
        },
      ),
    ).resolves.toEqual({
      eligible: 4,
      migrated: 2,
      skipped: 1,
      failed: 1,
      mode: 'execute',
    });
  });

  it('stops scheduling after a fatal image conflict while in-flight work settles', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => migrationImage(index));
    const releaseFirst = deferred();
    const started: number[] = [];

    const migration = runCloudflareR2Migration(
      { mode: 'execute', concurrency: 2 },
      {
        images: createReader(rows),
        migrateOne: async (image) => {
          const index = rows.findIndex((row) => row.id === image.id);
          started.push(index);
          if (index === 0) {
            await releaseFirst.promise;
            return 'migrated';
          }
          if (index === 1) {
            throw new ImageStorageMigrationConflictError(
              'Image changed during migration',
            );
          }
          return 'migrated';
        },
      },
    );
    const rejection = expect(migration).rejects.toBeInstanceOf(
      ImageStorageMigrationConflictError,
    );

    await nextEventLoopTurn();
    const beforeRelease = [...started];
    releaseFirst.resolve();

    await rejection;
    expect(beforeRelease).toEqual([0, 1]);
    expect(started).toEqual([0, 1]);
  });

  it('is idempotent when a rerun sees keys migrated by the first run', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => migrationImage(index));
    const migrateOne = jest.fn((image: MigrationImage) => {
      const persisted = rows.find((row) => row.id === image.id);
      if (!persisted) {
        return Promise.reject(new Error('Missing image fixture'));
      }
      persisted.r2ObjectKey = `albums/${persisted.albumId}/${persisted.filename}`;
      return Promise.resolve('migrated' as const);
    });
    const dependencies = {
      images: createReader(rows),
      migrateOne,
    };

    await expect(
      runCloudflareR2Migration(
        { mode: 'execute', concurrency: 2 },
        dependencies,
      ),
    ).resolves.toMatchObject({
      eligible: 3,
      migrated: 3,
      failed: 0,
    });
    await expect(
      runCloudflareR2Migration(
        { mode: 'execute', concurrency: 2 },
        dependencies,
      ),
    ).resolves.toEqual({
      eligible: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      mode: 'execute',
    });
    expect(migrateOne).toHaveBeenCalledTimes(3);
  });
});
