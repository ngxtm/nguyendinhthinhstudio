import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  STATIC_CLOUDFLARE_ASSETS,
  downloadStaticCloudflareAssets,
  importStaticAssetManifest,
  manifestPathFor,
  validateStaticAssetManifest,
  type CloudflareStaticAssetJournalRow,
  type CloudflareStaticAssetManifestRow,
  type CloudflareStaticAssetMigrationTable,
} from './cloudflare-static-assets';

const SOURCE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="#123456" d="M0 0h2v2H0z"/></svg>',
);
const NOW = new Date('2026-07-12T12:00:00.000Z');

function manifestRows(): CloudflareStaticAssetManifestRow[] {
  return STATIC_CLOUDFLARE_ASSETS.map((asset, index) => ({
    ...asset,
    sourceSha256: String(index).padStart(64, 'a').slice(-64),
    targetSha256: String(index).padStart(64, 'b').slice(-64),
    targetBytes: index + 1,
    downloadedAt: NOW.toISOString(),
  }));
}

function successfulFetch() {
  return jest.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    expect(init?.headers).toEqual({
      Authorization: 'Bearer read-token',
    });
    return new Response(SOURCE_SVG, {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    });
  });
}

class InMemoryStaticAssetTable implements CloudflareStaticAssetMigrationTable {
  readonly rows = new Map<string, CloudflareStaticAssetJournalRow>();

  async upsert(args: {
    where: { legacyCloudflareImageId: string };
    create: CloudflareStaticAssetJournalRow;
    update: Omit<CloudflareStaticAssetJournalRow, 'legacyCloudflareImageId'>;
  }) {
    const id = args.where.legacyCloudflareImageId;
    const existing = this.rows.get(id);
    this.rows.set(id, existing ? { ...existing, ...args.update } : args.create);
    return this.rows.get(id);
  }

  async count() {
    return this.rows.size;
  }

  async findMany(args: {
    where: { legacyCloudflareImageId: { in: string[] } };
  }) {
    return args.where.legacyCloudflareImageId.in
      .map((id) => this.rows.get(id))
      .filter((row): row is CloudflareStaticAssetJournalRow => Boolean(row));
  }
}

describe('Cloudflare static homepage asset migration', () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await mkdtemp(
      join(tmpdir(), 'cloudflare-static-assets-test-'),
    );
  });

  afterEach(async () => {
    await rm(repositoryRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('defines exactly the ten durable Cloudflare ID-to-path mappings', () => {
    expect(STATIC_CLOUDFLARE_ASSETS).toEqual([
      {
        legacyCloudflareImageId: '09389f8a-bd47-409d-f057-c456f492da00',
        localPath: 'public/images/home/hero-01.webp',
      },
      {
        legacyCloudflareImageId: 'be5b07b5-3a85-48f7-af0c-8e8a778b7f00',
        localPath: 'public/images/home/hero-02.webp',
      },
      {
        legacyCloudflareImageId: '444f1148-63fd-43f6-111f-7503dfc40700',
        localPath: 'public/images/home/hero-03.webp',
      },
      {
        legacyCloudflareImageId: '1d54a960-726a-41af-a31a-778f8ff87900',
        localPath: 'public/images/home/hero-04.webp',
      },
      {
        legacyCloudflareImageId: 'b1799cea-19c8-478a-fd08-cbb64b633f00',
        localPath: 'public/images/home/collection-01.webp',
      },
      {
        legacyCloudflareImageId: 'b33f71fd-e65c-42dc-f50b-ceb2dfc51400',
        localPath: 'public/images/home/collection-02.webp',
      },
      {
        legacyCloudflareImageId: '4b41393a-7fbe-4c33-2cfe-4aea40447500',
        localPath: 'public/images/home/collection-03.webp',
      },
      {
        legacyCloudflareImageId: 'a9b39412-e44b-4bf9-f101-8838a8096000',
        localPath: 'public/images/home/collection-04.webp',
      },
      {
        legacyCloudflareImageId: '098f40e8-2e7a-4bac-a4e9-1c75dcdbfe00',
        localPath: 'public/images/home/collection-05.webp',
      },
      {
        legacyCloudflareImageId: '9d7c5ca4-9072-4a45-3d46-c907d4b74b00',
        localPath: 'public/images/home/collection-06.webp',
      },
    ]);
  });

  it('downloads authenticated originals and produces deterministic WebP inventory rows', async () => {
    const fetchImpl = successfulFetch();

    const first = await downloadStaticCloudflareAssets({
      repositoryRoot,
      accountId: 'account-id',
      readToken: 'read-token',
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });
    const second = await downloadStaticCloudflareAssets({
      repositoryRoot,
      accountId: 'account-id',
      readToken: 'read-token',
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(20);
    expect(first).toHaveLength(10);
    expect(validateStaticAssetManifest(first)).toEqual(first);
    expect(second.map((row) => row.sourceSha256)).toEqual(
      first.map((row) => row.sourceSha256),
    );
    expect(second.map((row) => row.targetSha256)).toEqual(
      first.map((row) => row.targetSha256),
    );

    for (const row of second) {
      expect(row.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.targetSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.targetBytes).toBeGreaterThan(0);
      const target = join(repositoryRoot, 'apps/frontend', row.localPath);
      await expect(readFile(target)).resolves.toHaveLength(row.targetBytes);
    }

    const persisted = JSON.parse(
      await readFile(manifestPathFor(repositoryRoot), 'utf8'),
    );
    expect(validateStaticAssetManifest(persisted)).toEqual(second);
  });

  it('does not replace the durable manifest when any download fails', async () => {
    const manifestPath = manifestPathFor(repositoryRoot);
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, 'sentinel', 'utf8');
    let request = 0;
    const fetchImpl = jest.fn(async () => {
      request += 1;
      if (request === 5) {
        return new Response('unavailable', { status: 503 });
      }
      return new Response(SOURCE_SVG, {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      });
    });

    await expect(
      downloadStaticCloudflareAssets({
        repositoryRoot,
        accountId: 'account-id',
        readToken: 'read-token',
        fetch: fetchImpl as unknown as typeof fetch,
        now: () => NOW,
      }),
    ).rejects.toThrow('HTTP 503');

    await expect(readFile(manifestPath, 'utf8')).resolves.toBe('sentinel');
  });

  it('rejects incomplete, duplicate, or corrupt manifest rows', () => {
    const valid = manifestRows();
    expect(validateStaticAssetManifest(valid)).toEqual(valid);

    expect(() => validateStaticAssetManifest(valid.slice(1))).toThrow(
      'exactly 10 rows',
    );
    expect(() =>
      validateStaticAssetManifest([
        valid[0],
        { ...valid[0] },
        ...valid.slice(2),
      ]),
    ).toThrow('duplicate');
    expect(() =>
      validateStaticAssetManifest([
        { ...valid[0], targetSha256: 'not-a-hash' },
        ...valid.slice(1),
      ]),
    ).toThrow('targetSha256');
  });

  it('imports all rows transactionally and reruns without duplicates', async () => {
    const rows = manifestRows();
    const table = new InMemoryStaticAssetTable();
    const database = {
      cloudflareStaticAssetMigration: table,
      $transaction: async <T>(
        work: (transaction: {
          cloudflareStaticAssetMigration: CloudflareStaticAssetMigrationTable;
        }) => Promise<T>,
      ) =>
        work({
          cloudflareStaticAssetMigration: table,
        }),
    };

    await expect(importStaticAssetManifest(rows, database)).resolves.toEqual({
      imported: 10,
    });
    await expect(importStaticAssetManifest(rows, database)).resolves.toEqual({
      imported: 10,
    });

    expect(table.rows.size).toBe(10);
    expect(Array.from(table.rows.values())).toEqual(
      rows.map(({ downloadedAt: _downloadedAt, ...row }) => row),
    );
  });
});
