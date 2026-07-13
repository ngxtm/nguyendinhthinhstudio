import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildR2ObjectKey,
  ImageStorageMigrationConflictError,
  migrateOneImage,
  type OneImageMigrationDependencies,
} from './cloudflare-r2-migration';

type JournalRow = {
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

type ImageRow = {
  id: string;
  albumId: string;
  filename: string;
  r2ObjectKey: string | null;
};

type JournalDelegate = {
  findUnique(args: { where: { imageId: string } }): Promise<JournalRow | null>;
  create(args: {
    data: {
      imageId: string;
      legacyCloudflareImageId: string;
      targetR2ObjectKey: string;
    };
  }): Promise<JournalRow>;
  updateMany(args: {
    where: { imageId: string; status: string };
    data: Partial<JournalRow> & { status: string };
  }): Promise<{ count: number }>;
};

type ImageDelegate = {
  findUnique(args: { where: { id: string } }): Promise<ImageRow | null>;
  updateMany(args: {
    where: { id: string; r2ObjectKey: string };
    data: { r2ObjectKey: string };
  }): Promise<{ count: number }>;
};

type ImageObjectDeletionRow = {
  imageId: string;
  provider: 'r2';
  objectKey: string;
  status: 'pending' | 'deleted';
  deletedAt: Date | null;
  lastError: string | null;
};

type ImageObjectDeletionDelegate = {
  findUnique(args: {
    where: {
      provider_objectKey: {
        provider: 'r2';
        objectKey: string;
      };
    };
  }): Promise<ImageObjectDeletionRow | null>;
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
      status: 'pending' | 'deleted';
      deletedAt: Date | null;
      lastError: null;
    };
    update: {
      status: 'pending' | 'deleted';
      deletedAt: Date | null;
      lastError: null;
    };
  }): Promise<ImageObjectDeletionRow>;
};

class InMemoryMigrationDatabase {
  readonly events: string[] = [];
  readonly journals = new Map<string, JournalRow>();
  readonly images = new Map<string, ImageRow>();
  readonly queuedDeletions = new Map<string, ImageObjectDeletionRow>();
  externalImageChangeOnUpdate: string | null | undefined;
  journalUpdateFailure?: Error;
  journalUpdateFailures: Error[] = [];
  private pendingExternalImageChange: string | null | undefined;

  readonly imageStorageMigration: JournalDelegate = {
    findUnique: async () => null,
    create: async () => {
      throw new Error('Journal delegate is not initialized');
    },
    updateMany: async () => ({ count: 0 }),
  };

  readonly image: ImageDelegate = {
    findUnique: async () => null,
    updateMany: async () => ({ count: 0 }),
  };

  readonly imageObjectDeletion: ImageObjectDeletionDelegate = {
    findUnique: async ({ where }) => {
      const identity = where.provider_objectKey;
      const row = this.queuedDeletions.get(
        `${identity.provider}:${identity.objectKey}`,
      );
      return row ? { ...row } : null;
    },
    upsert: async ({ where, create, update }) => {
      this.events.push('cleanup-queued');
      const identity = where.provider_objectKey;
      const key = `${identity.provider}:${identity.objectKey}`;
      const existing = this.queuedDeletions.get(key);
      const row: ImageObjectDeletionRow = existing
        ? { ...existing, ...update }
        : { ...create, deletedAt: null, lastError: null };
      this.queuedDeletions.set(key, row);
      return { ...row };
    },
  };

  constructor(image: ImageRow) {
    this.images.set(image.id, { ...image });

    this.imageStorageMigration.findUnique = async ({ where }) => {
      const row = this.journals.get(where.imageId);
      return row ? { ...row } : null;
    };
    this.imageStorageMigration.create = async ({ data }) => {
      this.events.push('journal-created');
      const row: JournalRow = {
        ...data,
        status: 'pending',
        sourceSize: null,
        targetSize: null,
        sourceSha256: null,
        targetSha256: null,
        error: null,
        verifiedAt: null,
        cloudflareDeletedAt: null,
      };
      this.journals.set(row.imageId, row);
      return { ...row };
    };
    this.imageStorageMigration.updateMany = async ({ where, data }) => {
      const queuedFailure = this.journalUpdateFailures.shift();
      if (queuedFailure) {
        throw queuedFailure;
      }
      if (this.journalUpdateFailure) {
        const error = this.journalUpdateFailure;
        this.journalUpdateFailure = undefined;
        throw error;
      }
      const row = this.journals.get(where.imageId);
      if (!row || row.status !== where.status) {
        return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    };

    this.image.findUnique = async ({ where }) => {
      const row = this.images.get(where.id);
      return row ? { ...row } : null;
    };
    this.image.updateMany = async ({ where, data }) => {
      const row = this.images.get(where.id);
      if (this.externalImageChangeOnUpdate !== undefined) {
        this.pendingExternalImageChange = this.externalImageChangeOnUpdate;
        if (this.externalImageChangeOnUpdate === null) {
          this.images.delete(where.id);
        } else if (row) {
          row.r2ObjectKey = this.externalImageChangeOnUpdate;
        }
        return { count: 0 };
      }
      if (!row || row.r2ObjectKey !== where.r2ObjectKey) {
        return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    };
  }

  async $transaction<T>(
    work: (transaction: InMemoryMigrationDatabase) => Promise<T>,
  ): Promise<T> {
    const journalSnapshot = new Map(
      [...this.journals].map(([key, row]) => [key, { ...row }]),
    );
    const imageSnapshot = new Map(
      [...this.images].map(([key, row]) => [key, { ...row }]),
    );
    const deletionSnapshot = new Map(
      [...this.queuedDeletions].map(([key, row]) => [key, { ...row }]),
    );
    try {
      return await work(this);
    } catch (error) {
      this.journals.clear();
      for (const [key, row] of journalSnapshot) this.journals.set(key, row);
      this.images.clear();
      for (const [key, row] of imageSnapshot) this.images.set(key, row);
      this.queuedDeletions.clear();
      for (const [key, row] of deletionSnapshot) {
        this.queuedDeletions.set(key, row);
      }
      if (this.pendingExternalImageChange === null) {
        for (const key of imageSnapshot.keys()) this.images.delete(key);
      } else if (this.pendingExternalImageChange !== undefined) {
        for (const row of this.images.values()) {
          row.r2ObjectKey = this.pendingExternalImageChange;
        }
      }
      this.pendingExternalImageChange = undefined;
      throw error;
    }
  }
}

class InMemoryR2 {
  readonly events: string[];
  body = Buffer.alloc(0);
  contentType = '';
  contentLength?: number;
  objectKey = '';
  metadata: Record<string, string> = {};
  deletedKeys: string[] = [];
  getBodyOverride?: Buffer;
  headContentLengthOverride?: number;
  headContentTypeOverride?: string;
  deleteError?: Error;

  constructor(events: string[]) {
    this.events = events;
  }

  async send(command: unknown): Promise<unknown> {
    if (command instanceof PutObjectCommand) {
      this.events.push('r2-put');
      const chunks: Buffer[] = [];
      for await (const chunk of command.input
        .Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      this.body = Buffer.concat(chunks);
      this.objectKey = command.input.Key ?? '';
      this.contentType = command.input.ContentType ?? '';
      this.contentLength = command.input.ContentLength;
      this.metadata = command.input.Metadata ?? {};
      return {};
    }
    if (command instanceof HeadObjectCommand) {
      this.events.push('r2-head');
      return {
        ContentLength: this.headContentLengthOverride ?? this.body.length,
        ContentType: this.headContentTypeOverride ?? this.contentType,
        Metadata: this.metadata,
      };
    }
    if (command instanceof GetObjectCommand) {
      this.events.push('r2-get');
      return { Body: Readable.from([this.getBodyOverride ?? this.body]) };
    }
    if (command instanceof DeleteObjectCommand) {
      this.events.push('r2-delete');
      if (this.deleteError) {
        throw this.deleteError;
      }
      this.deletedKeys.push(command.input.Key ?? '');
      this.body = Buffer.alloc(0);
      return {};
    }
    throw new Error('Unexpected S3 command');
  }
}

describe('one-image Cloudflare to R2 migration pipeline', () => {
  const image: ImageRow = {
    id: '00000000-0000-4000-8000-000000000001',
    albumId: '00000000-0000-4000-8000-000000000002',
    filename: 'portrait.jpg',
    r2ObjectKey: '09389f8a-bd47-409d-f057-c456f492da00',
  };
  const source = Buffer.from('source-image-bytes');
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'cloudflare-r2-test-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(tempRoot, { recursive: true, force: true });
  });

  function successfulFetch(
    database: InMemoryMigrationDatabase,
    imgproxy: {
      status?: number;
      contentType?: string;
      contentLength?: string;
    } = {},
  ): typeof fetch {
    return async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url.startsWith('https://api.cloudflare.com/')) {
        database.events.push('cloudflare-fetch');
        return new Response(source, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(source.length),
            'x-seen-authorization':
              new Headers(init?.headers).get('authorization') ?? '',
          },
        });
      }
      database.events.push('imgproxy-fetch');
      return new Response(null, {
        status: imgproxy.status ?? 200,
        headers: {
          'content-type': imgproxy.contentType ?? 'image/webp',
          'content-length': imgproxy.contentLength ?? '123',
        },
      });
    };
  }

  function dependencies(
    database: InMemoryMigrationDatabase,
    r2: InMemoryR2,
    fetchImpl: typeof fetch = successfulFetch(database),
  ): OneImageMigrationDependencies {
    return {
      database,
      r2,
      bucket: 'migration-bucket',
      accountId: 'account-id',
      readToken: 'read-only-token',
      imageUrls: {
        getVariantUrls: () => ({
          mediumUrl: 'https://img.test/medium',
        }),
      },
      fetch: fetchImpl,
      tempRoot,
      now: () => new Date('2026-07-14T00:00:00.000Z'),
    };
  }

  it('persists intent before streaming and cryptographically verifies before DB cutover', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');

    const database = new InMemoryMigrationDatabase(image);
    const r2 = new InMemoryR2(database.events);
    let cloudflareAuthorization = '';
    const fetchImpl = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url.startsWith('https://api.cloudflare.com/')) {
        database.events.push('cloudflare-fetch');
        cloudflareAuthorization =
          new Headers(init?.headers).get('authorization') ?? '';
        return new Response(source, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(source.length),
          },
        });
      }
      database.events.push('imgproxy-fetch');
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': 'image/webp',
          'content-length': '123',
        },
      });
    };

    await expect(
      migrateOneImage(image as ImageRow & { r2ObjectKey: string }, {
        database,
        r2,
        bucket: 'migration-bucket',
        accountId: 'account-id',
        readToken: 'read-only-token',
        imageUrls: {
          getVariantUrls: () => ({
            mediumUrl: 'https://img.test/medium',
          }),
        },
        fetch: fetchImpl,
        tempRoot,
        now: () => new Date('2026-07-14T00:00:00.000Z'),
      }),
    ).resolves.toBe('migrated');

    const targetKey = buildR2ObjectKey(image);
    const sha256 = createHash('sha256').update(source).digest('hex');
    expect(database.events).toEqual([
      'journal-created',
      'cloudflare-fetch',
      'r2-put',
      'r2-head',
      'r2-get',
      'imgproxy-fetch',
    ]);
    expect(cloudflareAuthorization).toBe('Bearer read-only-token');
    expect(r2.body).toEqual(source);
    expect(r2.objectKey).toBe(targetKey);
    expect(r2.contentType).toBe('image/jpeg');
    expect(r2.contentLength).toBe(source.length);
    expect(r2.metadata).toEqual({
      'legacy-cloudflare-id': image.r2ObjectKey,
      'source-sha256': sha256,
    });
    expect(database.images.get(image.id)?.r2ObjectKey).toBe(targetKey);
    expect(database.journals.get(image.id)).toEqual(
      expect.objectContaining({
        legacyCloudflareImageId: image.r2ObjectKey,
        targetR2ObjectKey: targetKey,
        status: 'verified',
        sourceSize: source.length,
        targetSize: source.length,
        sourceSha256: sha256,
        targetSha256: sha256,
        verifiedAt: new Date('2026-07-14T00:00:00.000Z'),
        error: null,
      }),
    );
    await expect(readdir(tempRoot)).resolves.toEqual([]);
  });

  it('checkpoints a transient journal failure after PutObject as failed', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    database.journalUpdateFailure = new Error(
      'temporary journal write failure',
    );
    const r2 = new InMemoryR2(database.events);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toThrow('temporary journal write failure');

    expect(r2.body).toEqual(source);
    expect(database.journals.get(image.id)).toEqual(
      expect.objectContaining({
        targetR2ObjectKey: buildR2ObjectKey(image),
        status: 'failed',
        error: 'temporary journal write failure',
      }),
    );
    await expect(readdir(tempRoot)).resolves.toEqual([]);
  });

  it('halts with a typed conflict when a post-upload failure cannot be checkpointed', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    database.journalUpdateFailures.push(
      new Error('uploaded checkpoint unavailable'),
      new Error('failed checkpoint unavailable'),
    );
    const r2 = new InMemoryR2(database.events);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ImageStorageMigrationConflictError',
        message: expect.stringContaining(
          'Migration failure checkpoint could not be persisted',
        ),
      }),
    );

    expect(r2.body).toEqual(source);
    expect(database.journals.get(image.id)?.status).toBe('pending');
  });

  it('rejects equal-length R2 bytes with a different SHA-256', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const r2 = new InMemoryR2(database.events);
    r2.getBodyOverride = Buffer.alloc(source.length, 0x78);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toThrow('R2 object SHA-256 does not match');

    expect(database.images.get(image.id)?.r2ObjectKey).toBe(image.r2ObjectKey);
    expect(database.journals.get(image.id)).toEqual(
      expect.objectContaining({
        status: 'failed',
        sourceSize: source.length,
        sourceSha256: createHash('sha256').update(source).digest('hex'),
        targetSha256: null,
      }),
    );
    expect(database.events).not.toContain('imgproxy-fetch');
    await expect(readdir(tempRoot)).resolves.toEqual([]);
  });

  it('checkpoints uploaded source metadata conflicts as failed', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const r2 = new InMemoryR2(database.events);
    const storedTarget = 'albums/stored-target/conflict.jpg';
    database.journals.set(image.id, {
      imageId: image.id,
      legacyCloudflareImageId: image.r2ObjectKey,
      targetR2ObjectKey: storedTarget,
      status: 'uploaded',
      sourceSize: source.length,
      targetSize: null,
      sourceSha256: 'different-source-sha256',
      targetSha256: null,
      error: null,
      verifiedAt: null,
      cloudflareDeletedAt: null,
    });

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toBeInstanceOf(ImageStorageMigrationConflictError);

    expect(database.journals.get(image.id)).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: 'Uploaded journal source metadata no longer matches Cloudflare',
      }),
    );
    expect(database.images.get(image.id)?.r2ObjectKey).toBe(image.r2ObjectKey);
  });

  it('preserves a fatal conflict when temporary cleanup also fails', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const r2 = new InMemoryR2(database.events);
    database.journals.set(image.id, {
      imageId: image.id,
      legacyCloudflareImageId: image.r2ObjectKey,
      targetR2ObjectKey: 'albums/stored-target/conflict.jpg',
      status: 'uploaded',
      sourceSize: source.length,
      targetSize: null,
      sourceSha256: 'different-source-sha256',
      targetSha256: null,
      error: null,
      verifiedAt: null,
      cloudflareDeletedAt: null,
    });
    jest
      .spyOn(fsPromises, 'rm')
      .mockRejectedValueOnce(new Error('temporary cleanup failed'));

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toBeInstanceOf(ImageStorageMigrationConflictError);
  });

  it('keeps the legacy DB key when imgproxy verification fails', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const r2 = new InMemoryR2(database.events);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2, successfulFetch(database, { status: 502 })),
      ),
    ).rejects.toThrow('Imgproxy verification failed');

    expect(database.images.get(image.id)?.r2ObjectKey).toBe(image.r2ObjectKey);
    expect(database.journals.get(image.id)?.status).toBe('failed');
  });

  it('resumes an uploaded journal from its stored target without another PutObject', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const r2 = new InMemoryR2(database.events);
    const sha256 = createHash('sha256').update(source).digest('hex');
    const storedTarget = 'albums/stored-target/resume.jpg';
    database.journals.set(image.id, {
      imageId: image.id,
      legacyCloudflareImageId: image.r2ObjectKey,
      targetR2ObjectKey: storedTarget,
      status: 'uploaded',
      sourceSize: source.length,
      targetSize: null,
      sourceSha256: sha256,
      targetSha256: null,
      error: null,
      verifiedAt: null,
      cloudflareDeletedAt: null,
    });
    r2.body = source;
    r2.contentType = 'image/jpeg';
    r2.metadata = {
      'legacy-cloudflare-id': image.r2ObjectKey,
      'source-sha256': sha256,
    };

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).resolves.toBe('migrated');

    expect(database.events).not.toContain('r2-put');
    expect(database.events).not.toContain('journal-created');
    expect(database.images.get(image.id)?.r2ObjectKey).toBe(storedTarget);
    expect(database.journals.get(image.id)?.status).toBe('verified');
  });

  it('accepts a concurrent writer that already committed the verified target', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const targetKey = buildR2ObjectKey(image);
    database.externalImageChangeOnUpdate = targetKey;
    const r2 = new InMemoryR2(database.events);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).resolves.toBe('migrated');

    expect(database.images.get(image.id)?.r2ObjectKey).toBe(targetKey);
    expect(database.journals.get(image.id)?.status).toBe('verified');
    expect(database.queuedDeletions.size).toBe(0);
    expect(r2.deletedKeys).toEqual([]);
  });

  it('deletes the target and checkpoints skipped_deleted after a concurrent Image deletion', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    database.externalImageChangeOnUpdate = null;
    const r2 = new InMemoryR2(database.events);
    const targetKey = buildR2ObjectKey(image);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).resolves.toBe('skipped');

    expect(database.images.has(image.id)).toBe(false);
    expect(database.journals.get(image.id)).toEqual(
      expect.objectContaining({
        status: 'skipped_deleted',
        legacyCloudflareImageId: image.r2ObjectKey,
      }),
    );
    expect(r2.deletedKeys).toEqual([targetKey]);

    const completedEventCount = database.events.length;
    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).resolves.toBe('skipped');
    expect(database.events).toHaveLength(completedEventCount);
    expect(database.journals.get(image.id)?.legacyCloudflareImageId).toBe(
      image.r2ObjectKey,
    );
  });

  it('durably queues target cleanup when DeleteObject fails after a concurrent Image deletion', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    database.externalImageChangeOnUpdate = null;
    const r2 = new InMemoryR2(database.events);
    r2.deleteError = new Error('R2 deletion unavailable');
    const targetKey = buildR2ObjectKey(image);
    database.queuedDeletions.set(`r2:${targetKey}`, {
      imageId: image.id,
      provider: 'r2',
      objectKey: targetKey,
      status: 'deleted',
      deletedAt: new Date('2026-07-13T00:00:00.000Z'),
      lastError: 'old deletion state',
    });

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toThrow('Target cleanup remains pending after Image deletion');

    expect(database.images.has(image.id)).toBe(false);
    expect(database.journals.get(image.id)?.status).toBe('failed');
    expect(database.queuedDeletions.get(`r2:${targetKey}`)).toEqual({
      imageId: image.id,
      provider: 'r2',
      objectKey: targetKey,
      status: 'pending',
      deletedAt: null,
      lastError: null,
    });
    expect(database.events.slice(-2)).toEqual(['cleanup-queued', 'r2-delete']);
  });

  it('keeps changed-Image cleanup durable and surfaces conflict when DeleteObject fails', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const competingKey = 'albums/other-writer/image.jpg';
    database.externalImageChangeOnUpdate = competingKey;
    const r2 = new InMemoryR2(database.events);
    r2.deleteError = new Error('R2 deletion unavailable');
    const targetKey = buildR2ObjectKey(image);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toBeInstanceOf(ImageStorageMigrationConflictError);

    expect(database.images.get(image.id)?.r2ObjectKey).toBe(competingKey);
    expect(database.journals.get(image.id)?.status).toBe('failed');
    expect(database.queuedDeletions.get(`r2:${targetKey}`)?.status).toBe(
      'pending',
    );
    expect(database.events.slice(-2)).toEqual(['cleanup-queued', 'r2-delete']);
  });

  it('does not re-upload while deterministic target cleanup is pending', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    database.externalImageChangeOnUpdate = 'albums/other-writer/image.jpg';
    const r2 = new InMemoryR2(database.events);
    r2.deleteError = new Error('R2 deletion unavailable');

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toBeInstanceOf(ImageStorageMigrationConflictError);
    expect(database.events.filter((event) => event === 'r2-put')).toHaveLength(
      1,
    );

    database.externalImageChangeOnUpdate = undefined;
    r2.deleteError = undefined;

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toThrow('Target cleanup is still pending');
    expect(database.events.filter((event) => event === 'r2-put')).toHaveLength(
      1,
    );
  });

  it('marks a changed existing Image as failed and removes this run target', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const competingKey = 'albums/other-writer/image.jpg';
    database.externalImageChangeOnUpdate = competingKey;
    const r2 = new InMemoryR2(database.events);
    const targetKey = buildR2ObjectKey(image);

    await expect(
      migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2),
      ),
    ).rejects.toBeInstanceOf(ImageStorageMigrationConflictError);

    expect(database.images.get(image.id)?.r2ObjectKey).toBe(competingKey);
    expect(database.journals.get(image.id)?.status).toBe('failed');
    expect(r2.deletedKeys).toEqual([targetKey]);
    expect(database.queuedDeletions.get(`r2:${targetKey}`)).toEqual(
      expect.objectContaining({
        status: 'deleted',
        deletedAt: expect.any(Date),
        lastError: null,
      }),
    );
  });

  it('redacts the read token from both persisted and surfaced failures', async () => {
    if (!image.r2ObjectKey) throw new Error('Fixture requires a legacy ID');
    const database = new InMemoryMigrationDatabase(image);
    const r2 = new InMemoryR2(database.events);
    const leakingFetch: typeof fetch = async () => {
      throw new Error('transport exposed read-only-token');
    };

    let failure: unknown;
    try {
      await migrateOneImage(
        image as ImageRow & { r2ObjectKey: string },
        dependencies(database, r2, leakingFetch),
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain('read-only-token');
    expect(database.journals.get(image.id)?.error).toContain('[REDACTED]');
    expect(database.journals.get(image.id)?.error).not.toContain(
      'read-only-token',
    );
  });
});
