import { main } from '../../../scripts/migrate-cloudflare-images-to-r2';
import type {
  MigrationImage,
  MigrationSummary,
} from './cloudflare-r2-migration';

type FakePrisma = {
  image: {
    findMany: jest.Mock<Promise<MigrationImage[]>, [unknown]>;
  };
  $disconnect: jest.Mock<Promise<void>, []>;
};

type TestHooks = {
  env: NodeJS.ProcessEnv;
  createPrisma: () => FakePrisma;
  createExecuteMigrateOne: (
    prisma: FakePrisma,
    env: NodeJS.ProcessEnv,
  ) => (
    image: MigrationImage & { r2ObjectKey: string },
  ) => Promise<'migrated' | 'skipped'>;
  writeSummary: (summary: MigrationSummary) => void;
};

type TestableMain = (
  argv: readonly string[],
  hooks: TestHooks,
) => Promise<MigrationSummary>;

const runMain = main as unknown as TestableMain;
const legacyImage: MigrationImage & { r2ObjectKey: string } = {
  id: '00000000-0000-4000-8000-000000000001',
  albumId: '00000000-0000-4000-8000-000000000002',
  filename: 'legacy.jpg',
  r2ObjectKey: '09389f8a-bd47-409d-f057-c456f492da00',
};

function fakePrisma(rows: MigrationImage[]): FakePrisma {
  return {
    image: {
      findMany: jest.fn<Promise<MigrationImage[]>, [unknown]>(() =>
        Promise.resolve(rows.map((row) => ({ ...row }))),
      ),
    },
    $disconnect: jest.fn<Promise<void>, []>(() => Promise.resolve()),
  };
}

function executeEnvironment(): NodeJS.ProcessEnv {
  return {
    CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account',
    CLOUDFLARE_IMAGES_READ_TOKEN: 'read-only-token',
    CLOUDFLARE_R2_BUCKET_NAME: 'migration-bucket',
    R2_ACCESS_KEY_ID: 'r2-access-key',
    R2_SECRET_ACCESS_KEY: 'r2-secret-key',
    R2_S3_ENDPOINT: 'https://r2.example.test',
    IMGPROXY_KEY: '0011',
    IMGPROXY_SALT: '2233',
    IMGPROXY_BASE_URL: 'https://img.example.test',
  };
}

describe('Cloudflare to R2 migration CLI wiring', () => {
  it('keeps dry-run independent of migration and image runtime secrets', async () => {
    const prisma = fakePrisma([legacyImage]);
    const createExecuteMigrateOne = jest.fn();
    const writeSummary = jest.fn();

    await expect(
      runMain(['--dry-run'], {
        env: {},
        createPrisma: () => prisma,
        createExecuteMigrateOne,
        writeSummary,
      }),
    ).resolves.toEqual({
      eligible: 1,
      migrated: 0,
      skipped: 0,
      failed: 0,
      mode: 'dry-run',
    });

    expect(createExecuteMigrateOne).not.toHaveBeenCalled();
    expect(writeSummary).toHaveBeenCalledWith({
      eligible: 1,
      migrated: 0,
      skipped: 0,
      failed: 0,
      mode: 'dry-run',
    });
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      env: {},
      missing: 'CLOUDFLARE_ACCOUNT_ID',
    },
    {
      env: { CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account' },
      missing: 'CLOUDFLARE_IMAGES_READ_TOKEN',
    },
  ])(
    'rejects execute before constructing clients when $missing is absent',
    async ({ env, missing }) => {
      const createPrisma = jest.fn(() => fakePrisma([legacyImage]));
      const createExecuteMigrateOne = jest.fn();

      await expect(
        runMain(['--execute'], {
          env,
          createPrisma,
          createExecuteMigrateOne,
          writeSummary: jest.fn(),
        }),
      ).rejects.toThrow(`${missing} is required`);

      expect(createPrisma).not.toHaveBeenCalled();
      expect(createExecuteMigrateOne).not.toHaveBeenCalled();
    },
  );

  it('constructs the execute pipeline and returns its JSON-ready summary', async () => {
    const env = executeEnvironment();
    const prisma = fakePrisma([legacyImage]);
    const migrateOne = jest.fn(() => Promise.resolve('migrated' as const));
    const createExecuteMigrateOne = jest.fn(() => migrateOne);
    const writeSummary = jest.fn();

    await expect(
      runMain(['--execute', '--concurrency=2'], {
        env,
        createPrisma: () => prisma,
        createExecuteMigrateOne,
        writeSummary,
      }),
    ).resolves.toEqual({
      eligible: 1,
      migrated: 1,
      skipped: 0,
      failed: 0,
      mode: 'execute',
    });

    expect(createExecuteMigrateOne).toHaveBeenCalledWith(prisma, env);
    expect(migrateOne).toHaveBeenCalledWith(legacyImage);
    expect(writeSummary).toHaveBeenCalledWith({
      eligible: 1,
      migrated: 1,
      skipped: 0,
      failed: 0,
      mode: 'execute',
    });
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
