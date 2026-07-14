import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

export type CloudflareStaticAssetDefinition = {
  legacyCloudflareImageId: string;
  localPath: string;
};

export type CloudflareStaticAssetManifestRow =
  CloudflareStaticAssetDefinition & {
    sourceSha256: string;
    targetSha256: string;
    targetBytes: number;
    downloadedAt: string;
  };

export type CloudflareStaticAssetJournalRow = Omit<
  CloudflareStaticAssetManifestRow,
  'downloadedAt'
>;

export const STATIC_CLOUDFLARE_ASSETS: readonly CloudflareStaticAssetDefinition[] =
  [
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
  ];

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function assertDefinitions(): void {
  if (STATIC_CLOUDFLARE_ASSETS.length !== 10) {
    throw new Error('Static Cloudflare inventory must contain exactly 10 rows');
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const asset of STATIC_CLOUDFLARE_ASSETS) {
    if (!UUID_PATTERN.test(asset.legacyCloudflareImageId)) {
      throw new Error('Static Cloudflare inventory contains an invalid ID');
    }
    if (
      !/^public\/images\/home\/(?:hero|collection)-\d{2}\.webp$/.test(
        asset.localPath,
      )
    ) {
      throw new Error('Static Cloudflare inventory contains an invalid path');
    }
    if (ids.has(asset.legacyCloudflareImageId)) {
      throw new Error('Static Cloudflare inventory contains a duplicate ID');
    }
    if (paths.has(asset.localPath)) {
      throw new Error('Static Cloudflare inventory contains a duplicate path');
    }
    ids.add(asset.legacyCloudflareImageId);
    paths.add(asset.localPath);
  }
}

function requireString(
  value: unknown,
  field: keyof CloudflareStaticAssetManifestRow,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Static asset manifest ${field} must be a string`);
  }
  return value;
}

export function validateStaticAssetManifest(
  value: unknown,
): CloudflareStaticAssetManifestRow[] {
  assertDefinitions();
  if (!Array.isArray(value) || value.length !== 10) {
    throw new Error('Static asset manifest must contain exactly 10 rows');
  }

  const expectedById = new Map(
    STATIC_CLOUDFLARE_ASSETS.map((asset) => [
      asset.legacyCloudflareImageId,
      asset.localPath,
    ]),
  );
  const ids = new Set<string>();
  const paths = new Set<string>();

  const rows = value.map((candidate): CloudflareStaticAssetManifestRow => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Static asset manifest row must be an object');
    }
    const row = candidate as Record<string, unknown>;
    const legacyCloudflareImageId = requireString(
      row.legacyCloudflareImageId,
      'legacyCloudflareImageId',
    );
    const localPath = requireString(row.localPath, 'localPath');
    const sourceSha256 = requireString(row.sourceSha256, 'sourceSha256');
    const targetSha256 = requireString(row.targetSha256, 'targetSha256');
    const downloadedAt = requireString(row.downloadedAt, 'downloadedAt');
    const targetBytes = row.targetBytes;

    if (ids.has(legacyCloudflareImageId) || paths.has(localPath)) {
      throw new Error('Static asset manifest contains a duplicate ID or path');
    }
    ids.add(legacyCloudflareImageId);
    paths.add(localPath);

    if (expectedById.get(legacyCloudflareImageId) !== localPath) {
      throw new Error('Static asset manifest does not match managed mappings');
    }
    if (!SHA256_PATTERN.test(sourceSha256)) {
      throw new Error('Static asset manifest sourceSha256 is invalid');
    }
    if (!SHA256_PATTERN.test(targetSha256)) {
      throw new Error('Static asset manifest targetSha256 is invalid');
    }
    if (
      !Number.isSafeInteger(targetBytes) ||
      (targetBytes as number) <= 0 ||
      (targetBytes as number) > 2_147_483_647
    ) {
      throw new Error('Static asset manifest targetBytes is invalid');
    }
    if (
      Number.isNaN(Date.parse(downloadedAt)) ||
      new Date(downloadedAt).toISOString() !== downloadedAt
    ) {
      throw new Error('Static asset manifest downloadedAt is invalid');
    }

    return {
      legacyCloudflareImageId,
      localPath,
      sourceSha256,
      targetSha256,
      targetBytes: targetBytes as number,
      downloadedAt,
    };
  });

  if (ids.size !== expectedById.size) {
    throw new Error('Static asset manifest is missing a managed ID');
  }

  return rows;
}

export function manifestPathFor(repositoryRoot: string): string {
  return join(
    repositoryRoot,
    'apps',
    'backend',
    'data',
    'cloudflare-static-image-inventory.json',
  );
}

function targetPathFor(repositoryRoot: string, localPath: string): string {
  return join(repositoryRoot, 'apps', 'frontend', ...localPath.split('/'));
}

async function downloadOriginal(
  asset: CloudflareStaticAssetDefinition,
  targetPath: string,
  accountId: string,
  readToken: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    accountId,
  )}/images/v1/${encodeURIComponent(asset.legacyCloudflareImageId)}/blob`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${readToken}`,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Cloudflare static image download failed with HTTP ${response.status}`,
    );
  }
  const contentType = (response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith('image/')) {
    await response.body?.cancel();
    throw new Error('Cloudflare static original content type is not an image');
  }
  if (!response.body) {
    throw new Error('Cloudflare static original response body is missing');
  }

  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      hash.update(buffer);
      callback(null, buffer);
    },
  });
  await pipeline(
    Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
    meter,
    createWriteStream(targetPath, { mode: 0o600 }),
  );
  if (bytes === 0) {
    throw new Error('Cloudflare static original is empty');
  }
  return hash.digest('hex');
}

async function hashFile(path: string): Promise<{
  sha256: string;
  bytes: number;
}> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { sha256: hash.digest('hex'), bytes };
}

async function writeManifestAtomically(
  path: string,
  rows: readonly CloudflareStaticAssetManifestRow[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(rows, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export type DownloadStaticAssetsOptions = {
  repositoryRoot: string;
  accountId: string;
  readToken: string;
  fetch?: typeof fetch;
  now?: () => Date;
};

export async function downloadStaticCloudflareAssets(
  options: DownloadStaticAssetsOptions,
): Promise<CloudflareStaticAssetManifestRow[]> {
  assertDefinitions();
  if (!options.accountId.trim()) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
  }
  if (!options.readToken.trim()) {
    throw new Error('CLOUDFLARE_IMAGES_READ_TOKEN is required');
  }

  const homeDirectory = join(
    options.repositoryRoot,
    'apps',
    'frontend',
    'public',
    'images',
    'home',
  );
  await mkdir(homeDirectory, { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(homeDirectory, '.cloudflare-static-'),
  );
  const downloadedAt = (options.now ?? (() => new Date()))().toISOString();
  const stagedTargets: string[] = [];

  try {
    const rows: CloudflareStaticAssetManifestRow[] = [];
    for (const [index, asset] of STATIC_CLOUDFLARE_ASSETS.entries()) {
      const sourcePath = join(stagingDirectory, `${index}.source`);
      const stagedTarget = join(stagingDirectory, `${index}.webp`);
      const sourceSha256 = await downloadOriginal(
        asset,
        sourcePath,
        options.accountId,
        options.readToken,
        options.fetch ?? fetch,
      );
      await sharp(sourcePath, { failOn: 'error' })
        .rotate()
        .webp({ quality: 85, effort: 6, smartSubsample: true })
        .toFile(stagedTarget);
      const target = await hashFile(stagedTarget);
      if (target.bytes === 0) {
        throw new Error('Optimized static WebP is empty');
      }
      stagedTargets.push(stagedTarget);
      rows.push({
        ...asset,
        sourceSha256,
        targetSha256: target.sha256,
        targetBytes: target.bytes,
        downloadedAt,
      });
    }

    const validated = validateStaticAssetManifest(rows);
    for (const [index, row] of validated.entries()) {
      const destination = targetPathFor(options.repositoryRoot, row.localPath);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(stagedTargets[index], destination);
    }
    await writeManifestAtomically(
      manifestPathFor(options.repositoryRoot),
      validated,
    );
    return validated;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function readStaticAssetManifest(
  repositoryRoot: string,
): Promise<CloudflareStaticAssetManifestRow[]> {
  const value = JSON.parse(
    await readFile(manifestPathFor(repositoryRoot), 'utf8'),
  ) as unknown;
  return validateStaticAssetManifest(value);
}

export interface CloudflareStaticAssetMigrationTable {
  upsert(args: {
    where: { legacyCloudflareImageId: string };
    create: CloudflareStaticAssetJournalRow;
    update: Omit<CloudflareStaticAssetJournalRow, 'legacyCloudflareImageId'>;
  }): Promise<unknown>;
  count(): Promise<number>;
  findMany(args: {
    where: { legacyCloudflareImageId: { in: string[] } };
  }): Promise<CloudflareStaticAssetJournalRow[]>;
}

type CloudflareStaticAssetMigrationTransaction = {
  cloudflareStaticAssetMigration: CloudflareStaticAssetMigrationTable;
};

export interface CloudflareStaticAssetMigrationDatabase
  extends CloudflareStaticAssetMigrationTransaction {
  $transaction<T>(
    work: (
      transaction: CloudflareStaticAssetMigrationTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

function journalRow(
  row: CloudflareStaticAssetManifestRow,
): CloudflareStaticAssetJournalRow {
  const { downloadedAt: _downloadedAt, ...journal } = row;
  return journal;
}

function sameJournalRow(
  actual: CloudflareStaticAssetJournalRow,
  expected: CloudflareStaticAssetJournalRow,
): boolean {
  return (
    actual.legacyCloudflareImageId === expected.legacyCloudflareImageId &&
    actual.localPath === expected.localPath &&
    actual.sourceSha256 === expected.sourceSha256 &&
    actual.targetSha256 === expected.targetSha256 &&
    actual.targetBytes === expected.targetBytes
  );
}

export async function importStaticAssetManifest(
  value: unknown,
  database: CloudflareStaticAssetMigrationDatabase,
): Promise<{ imported: number }> {
  const rows = validateStaticAssetManifest(value);
  const expected = rows.map(journalRow);
  await database.$transaction(async (transaction) => {
    for (const row of expected) {
      const { legacyCloudflareImageId, ...mutableFields } = row;
      await transaction.cloudflareStaticAssetMigration.upsert({
        where: { legacyCloudflareImageId },
        create: row,
        update: mutableFields,
      });
    }

    const total = await transaction.cloudflareStaticAssetMigration.count();
    const persisted = await transaction.cloudflareStaticAssetMigration.findMany(
      {
        where: {
          legacyCloudflareImageId: {
            in: expected.map((row) => row.legacyCloudflareImageId),
          },
        },
      },
    );
    if (
      total !== expected.length ||
      persisted.length !== expected.length ||
      expected.some((row) => {
        const actual = persisted.find(
          (candidate) =>
            candidate.legacyCloudflareImageId === row.legacyCloudflareImageId,
        );
        return !actual || !sameJournalRow(actual, row);
      })
    ) {
      throw new Error(
        'Cloudflare static asset journal does not match the manifest',
      );
    }
  });

  return { imported: expected.length };
}
