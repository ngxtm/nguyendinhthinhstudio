import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  PRODUCTION_SMOKE_CHECKS,
  canonicalSha256,
  createSmokeJournal,
  parseProductionSmokeEnvironment,
  readProtectedJson,
  readSmokeJournal,
  sha256,
  updateSmokeJournal,
  writeSmokeReceipt,
  type ProductionSmokeJournalDraft,
  type ReleaseTuple,
} from './image-upload-production-smoke-contract';

const release: ReleaseTuple = {
  imageReference: 'ndt-studio-backend:46d9c02b201a',
  imageDigest:
    'sha256:c8b87f95045a7777b28ceaff4e5b27056851faa8bc7ec9e7e69ec46bf05349ed',
  commitSha: '46d9c02b201ac8310637c63018ed61109d80b3a3',
  releaseFingerprint:
    'sha256:6f9caafe86584a983c2ebb2d49119a5afd674f568f4e599ca2f73c46f68e1b6a',
};

describe('production smoke evidence contract', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ndt-production-smoke-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function evidencePath(name: string): string {
    return resolve(directory, name);
  }

  function validEnvironment(): Record<string, string> {
    return {
      NDT_PRODUCTION_SMOKE_API_BASE_URL: 'https://api.ndtstudio.site',
      NDT_PRODUCTION_SMOKE_IMGPROXY_BASE_URL: 'https://img.ndtstudio.site',
      NDT_PRODUCTION_SMOKE_ADMIN_BEARER_TOKEN: 'admin-bearer-secret',
      NDT_PRODUCTION_SMOKE_TOKEN: 'operator-smoke-token-with-at-least-32-bytes',
      NDT_PRODUCTION_SMOKE_OPERATOR_TOKEN: 'cutover-operator-secret',
      DATABASE_URL: 'postgresql://runtime-db.internal/app',
      IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID: 'cutover-access-key',
      IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY: 'cutover-secret-key',
      IMAGE_UPLOAD_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      IMAGE_UPLOAD_R2_BUCKET: 'ndt-production-images',
      IMAGE_UPLOAD_RELEASE_COMMIT: release.commitSha,
      IMAGE_UPLOAD_BUILD_FINGERPRINT: release.releaseFingerprint,
      NDT_PRODUCTION_SMOKE_IMAGE_REFERENCE: release.imageReference,
      NDT_PRODUCTION_SMOKE_IMAGE_DIGEST: release.imageDigest,
      NDT_PRODUCTION_SMOKE_PHASE1_RECEIPT: evidencePath('phase1.json'),
      NDT_PRODUCTION_SMOKE_PHASE1_APPROVAL: evidencePath(
        'phase1-approval.json',
      ),
      NDT_PRODUCTION_SMOKE_AUTHORIZATION: evidencePath('authorization.json'),
      NDT_PRODUCTION_SMOKE_JOURNAL: evidencePath('journal.json'),
      NDT_PRODUCTION_SMOKE_RECEIPT: evidencePath('receipt.json'),
    };
  }

  function journalDraft(): ProductionSmokeJournalDraft {
    return {
      runId: '00000000-0000-4000-8000-000000000099',
      release,
      adminIdSha256: 'a'.repeat(64),
      lifecycle: 'authorized',
      completedChecks: [],
      resources: [],
      cleanupStatus: 'pending',
      updatedAt: '2026-07-23T12:00:00.000Z',
    };
  }

  it('parses exact absolute inputs and keeps secrets out of sanitized output', () => {
    const env = validEnvironment();
    const parsed = parseProductionSmokeEnvironment(
      env,
      resolve(directory, 'repo'),
    );

    expect(parsed.release).toEqual(release);
    expect(parsed.paths).toEqual({
      phase1Receipt: env.NDT_PRODUCTION_SMOKE_PHASE1_RECEIPT,
      phase1Approval: env.NDT_PRODUCTION_SMOKE_PHASE1_APPROVAL,
      authorization: env.NDT_PRODUCTION_SMOKE_AUTHORIZATION,
      journal: env.NDT_PRODUCTION_SMOKE_JOURNAL,
      receipt: env.NDT_PRODUCTION_SMOKE_RECEIPT,
    });
    expect(JSON.stringify(parsed.sanitized)).not.toMatch(
      /admin-bearer-secret|operator-smoke-token|cutover-operator-secret|cutover-secret-key/,
    );
  });

  it.each([
    ['NDT_PRODUCTION_SMOKE_TOKEN', ''],
    ['NDT_PRODUCTION_SMOKE_TOKEN', 'short'],
    ['NDT_PRODUCTION_SMOKE_API_BASE_URL', 'http://api.ndtstudio.site'],
    ['IMAGE_UPLOAD_RELEASE_COMMIT', 'not-a-commit'],
    ['NDT_PRODUCTION_SMOKE_IMAGE_DIGEST', `sha256:${'A'.repeat(64)}`],
    ['NDT_PRODUCTION_SMOKE_JOURNAL', 'relative/journal.json'],
  ])('rejects invalid environment %s', (key, value) => {
    expect(() =>
      parseProductionSmokeEnvironment(
        { ...validEnvironment(), [key]: value },
        resolve(directory, 'repo'),
      ),
    ).toThrow(key);
  });

  it('rejects aliased paths and evidence paths inside the repository', () => {
    const aliased = validEnvironment();
    aliased.NDT_PRODUCTION_SMOKE_RECEIPT = aliased.NDT_PRODUCTION_SMOKE_JOURNAL;
    expect(() =>
      parseProductionSmokeEnvironment(aliased, resolve(directory, 'repo')),
    ).toThrow(/distinct/i);

    const inside = validEnvironment();
    inside.NDT_PRODUCTION_SMOKE_JOURNAL = resolve(
      directory,
      'repo',
      'journal.json',
    );
    expect(() =>
      parseProductionSmokeEnvironment(inside, resolve(directory, 'repo')),
    ).toThrow(/outside/i);
  });

  it('creates a canonical mode-600 journal once and never persists secrets', async () => {
    const path = evidencePath('journal.json');
    const created = await createSmokeJournal(path, journalDraft());
    const bytes = await readFile(path);

    expect(created.canonicalSha256).toBe(canonicalSha256(created));
    expect(sha256(bytes)).toMatch(/^[a-f0-9]{64}$/);
    expect(bytes.toString()).not.toMatch(/secret|operator-smoke-token/i);
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    await expect(createSmokeJournal(path, journalDraft())).rejects.toThrow(
      /exist/i,
    );
  });

  it('rejects unknown or sensitive journal fields before persistence', async () => {
    const path = evidencePath('journal.json');
    await expect(
      createSmokeJournal(path, {
        ...journalDraft(),
        adminBearerToken: 'must-never-persist',
      } as never),
    ).rejects.toThrow(/unknown|sensitive/i);
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects malformed or foreign resource records', async () => {
    const path = evidencePath('journal.json');
    await expect(
      createSmokeJournal(path, {
        ...journalDraft(),
        resources: [
          {
            kind: 'object',
            id: 'object-1',
            objectKey: '../foreign-key',
            objectKeySha256: 'a'.repeat(64),
          },
        ],
      }),
    ).rejects.toThrow(/objectKey/i);
  });

  it('updates the journal canonically and validates protected JSON bytes', async () => {
    const path = evidencePath('journal.json');
    const created = await createSmokeJournal(path, journalDraft());
    const updated = await updateSmokeJournal(path, {
      ...created,
      lifecycle: 'running',
      completedChecks: ['browserUpload'],
      updatedAt: '2026-07-23T12:01:00.000Z',
    });

    expect((await readSmokeJournal(path)).canonicalSha256).toBe(
      updated.canonicalSha256,
    );
    await expect(readProtectedJson(path)).resolves.toMatchObject({
      lifecycle: 'running',
    });

    const changed = JSON.parse(await readFile(path, 'utf8'));
    changed.lifecycle = 'complete';
    await writeFile(path, `${JSON.stringify(changed)}\n`, { mode: 0o600 });
    await expect(readSmokeJournal(path)).rejects.toThrow(/canonical/i);
  });

  it('writes the official receipt only after every check and cleanup pass', async () => {
    const journalPath = evidencePath('journal.json');
    const authorizationPath = evidencePath('authorization.json');
    const receiptPath = evidencePath('receipt.json');
    const authorizationBody = {
      schemaVersion: 'image-upload-operator-smoke-authorization/v1',
      release,
      operatorFingerprintSha256: 'b'.repeat(64),
      approvedAt: '2026-07-23T11:45:52.299Z',
      decision: 'approved',
    };
    const authorization = {
      ...authorizationBody,
      canonicalSha256: canonicalSha256(authorizationBody),
    };
    await writeFile(
      authorizationPath,
      `${JSON.stringify(authorization, null, 2)}\n`,
      { mode: 0o600 },
    );
    if (process.platform !== 'win32') await chmod(authorizationPath, 0o600);

    const incomplete = await createSmokeJournal(journalPath, journalDraft());
    await expect(
      writeSmokeReceipt({
        path: receiptPath,
        authorizationPath,
        journal: incomplete,
        createdAt: '2026-07-23T12:02:00.000Z',
        receiptId: '00000000-0000-4000-8000-000000000100',
      }),
    ).rejects.toThrow(/checks|cleanup/i);

    const completed = await updateSmokeJournal(journalPath, {
      ...incomplete,
      lifecycle: 'complete',
      completedChecks: [...PRODUCTION_SMOKE_CHECKS],
      cleanupStatus: 'complete',
      updatedAt: '2026-07-23T12:02:00.000Z',
    });
    const receipt = await writeSmokeReceipt({
      path: receiptPath,
      authorizationPath,
      journal: completed,
      createdAt: '2026-07-23T12:02:00.000Z',
      receiptId: '00000000-0000-4000-8000-000000000100',
    });

    expect(Object.values(receipt.checks)).toEqual(Array(12).fill(true));
    expect(receipt.authorizationPathSha256).toBe(
      sha256(Buffer.from(authorizationPath)),
    );
    expect(receipt.authorizationSha256).toBe(
      sha256(await readFile(authorizationPath)),
    );
    expect(receipt.canonicalSha256).toBe(canonicalSha256(receipt));
    await expect(
      writeSmokeReceipt({
        path: receiptPath,
        authorizationPath,
        journal: completed,
        createdAt: '2026-07-23T12:02:00.000Z',
        receiptId: '00000000-0000-4000-8000-000000000100',
      }),
    ).rejects.toThrow(/exist/i);
  });

  it('rejects authorization documents with unknown sensitive fields', async () => {
    const journalPath = evidencePath('journal.json');
    const authorizationPath = evidencePath('authorization.json');
    const receiptPath = evidencePath('receipt.json');
    const journal = await createSmokeJournal(journalPath, {
      ...journalDraft(),
      lifecycle: 'complete',
      completedChecks: [...PRODUCTION_SMOKE_CHECKS],
      cleanupStatus: 'complete',
    });
    const authorizationBody = {
      schemaVersion: 'image-upload-operator-smoke-authorization/v1',
      release,
      operatorFingerprintSha256: 'b'.repeat(64),
      approvedAt: '2026-07-23T11:45:52.299Z',
      decision: 'approved',
      smokeToken: 'must-never-be-accepted',
    };
    await writeFile(
      authorizationPath,
      `${JSON.stringify({
        ...authorizationBody,
        canonicalSha256: canonicalSha256(authorizationBody),
      })}\n`,
      { mode: 0o600 },
    );

    await expect(
      writeSmokeReceipt({
        path: receiptPath,
        authorizationPath,
        journal,
        createdAt: '2026-07-23T12:02:00.000Z',
        receiptId: '00000000-0000-4000-8000-000000000100',
      }),
    ).rejects.toThrow(/unknown|sensitive/i);
  });
});
