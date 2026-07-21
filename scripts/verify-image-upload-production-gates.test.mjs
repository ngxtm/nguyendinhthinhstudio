/* global process, Buffer */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    chmodSync,
    copyFileSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptsDirectory, '..');
const verifier = resolve(scriptsDirectory, 'verify-image-upload-production-gates.mjs');
const passFixture = resolve(scriptsDirectory, 'fixtures/image-upload-production-gates/pass.json');
const failFixtureDirectory = resolve(
    scriptsDirectory,
    'fixtures/image-upload-production-gates/fail',
);
const schemaPath = resolve(
    scriptsDirectory,
    'schemas/image-upload-production-evidence.schema.json',
);
const requiredSensitiveFixtures = [
    'forbidden-secret.json',
    'forbidden-object-key.json',
    'forbidden-etag.json',
    'forbidden-url.json',
];
const requiredOrderingAndIsolationFixtures = new Map([
    ['schema-before-semantics.json', 'schema'],
    ['role-credential-isolation.json', 'credentialIsolation'],
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => key !== 'canonicalSha256')
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, stableValue(entry)]),
        );
    }
    return value;
}

const canonicalSha256 = (value) => sha256(JSON.stringify(stableValue(value)));

function runFixture(path, nodeEnv = 'test') {
    return spawnSync(process.execPath, [verifier, '--fixture', path], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: nodeEnv },
    });
}

function assertEveryObjectIsClosed(value, path = '$') {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertEveryObjectIsClosed(entry, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.type === 'object') {
        assert.equal(value.additionalProperties, false, `${path} must be closed`);
    }
    for (const [key, entry] of Object.entries(value)) {
        assertEveryObjectIsClosed(entry, `${path}.${key}`);
    }
}

test('schema is closed and rejects asynchronous or sensitive evidence fields', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    assertEveryObjectIsClosed(schema);

    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const forbiddenFields = [
        'Queue',
        'DLQ',
        'consumer',
        'eventRule',
        'providerEvent',
        'ACK',
        'replay',
        'token',
        'secret',
        'objectKey',
        'eTag',
        'url',
    ];

    for (const field of forbiddenFields) {
        const receipt = structuredClone(JSON.parse(readFileSync(passFixture, 'utf8')));
        receipt.provider[field] = 'forbidden';
        assert.equal(validate(receipt), false, `${field} must be rejected`);
    }
});

test('fixture mode is test-only and the pass fixture succeeds', () => {
    const accepted = runFixture(passFixture);
    assert.equal(accepted.status, 0, accepted.stderr);

    const rejected = runFixture(passFixture, 'production');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /gate=arguments/);
});

test('every fail fixture exits nonzero and names its expected gate', () => {
    const fixtureNames = readdirSync(failFixtureDirectory)
        .filter((name) => name.endsWith('.json'))
        .sort();
    for (const name of fixtureNames) {
        const path = resolve(failFixtureDirectory, name);
        const fixture = JSON.parse(readFileSync(path, 'utf8'));
        const result = runFixture(path);
        assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
        assert.match(result.stderr, new RegExp(`gate=${fixture.expectedGate}(?:\\s|$)`), name);
    }
});

for (const name of requiredSensitiveFixtures) {
    test(`${name} independently rejects forbidden evidence`, () => {
        const result = runFixture(resolve(failFixtureDirectory, name));
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /gate=schema(?:\s|$)/);
    });
}

for (const [name, gate] of requiredOrderingAndIsolationFixtures) {
    test(`${name} fails at ${gate}`, () => {
        const result = runFixture(resolve(failFixtureDirectory, name));
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, new RegExp(`gate=${gate}(?:\\s|$)`));
    });
}

test('argument parsing fails closed for implicit, multiple, mixed, or relative inputs', () => {
    const cases = [
        [],
        ['--receipt', 'receipt.json'],
        ['--approval', 'approval.json'],
        ['--fixture', passFixture, '--approval', 'approval.json'],
        ['--fixture', passFixture, '--fixture', passFixture],
    ];
    for (const args of cases) {
        const result = spawnSync(process.execPath, [verifier, ...args], {
            cwd: repositoryRoot,
            encoding: 'utf8',
            env: { ...process.env, NODE_ENV: 'test' },
        });
        assert.notEqual(result.status, 0, args.join(' '));
        assert.match(result.stderr, /gate=arguments/);
    }

    const relative = spawnSync(
        process.execPath,
        [verifier, '--receipt', 'receipt.json', '--approval', 'approval.json'],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /gate=receiptPath/);

    const outsideFixtureDirectory = mkdtempSync(join(tmpdir(), 'ndt-fixture-boundary-'));
    const outsideFixture = join(outsideFixtureDirectory, 'pass.json');
    copyFileSync(passFixture, outsideFixture);
    const outside = runFixture(outsideFixture);
    assert.notEqual(outside.status, 0);
    assert.match(outside.stderr, /gate=arguments/);
});

test('production mode binds protected receipt and approval paths and bytes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ndt-production-gates-'));
    chmodSync(directory, 0o700);
    const receiptPath = join(directory, 'receipt.json');
    const approvalPath = join(directory, 'approval.json');
    const relocatedApprovalPath = join(directory, 'relocated-approval.json');
    const receipt = JSON.parse(readFileSync(passFixture, 'utf8'));
    receipt.receiptPathSha256 = sha256(resolve(receiptPath));
    receipt.canonicalSha256 = canonicalSha256(receipt);
    writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    const receiptBytes = readFileSync(receiptPath);
    const approvalDraft = {
        schemaVersion: 'image-upload-production-gate-approval/v2-polling',
        receiptPathSha256: sha256(resolve(receiptPath)),
        receiptSha256: sha256(receiptBytes),
        approvalPathSha256: sha256(resolve(approvalPath)),
        approverFingerprintSha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        approvedAt: '2026-07-21T00:11:00.000Z',
        decision: 'approved',
    };
    const approval = {
        ...approvalDraft,
        canonicalSha256: canonicalSha256(approvalDraft),
    };
    writeFileSync(approvalPath, JSON.stringify(approval), { mode: 0o600 });

    const accepted = spawnSync(
        process.execPath,
        [verifier, '--receipt', receiptPath, '--approval', approvalPath],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(accepted.status, 0, accepted.stderr);

    if (process.platform !== 'win32') {
        chmodSync(receiptPath, 0o644);
        const broadPermissions = spawnSync(
            process.execPath,
            [verifier, '--receipt', receiptPath, '--approval', approvalPath],
            { cwd: repositoryRoot, encoding: 'utf8' },
        );
        assert.notEqual(broadPermissions.status, 0);
        assert.match(broadPermissions.stderr, /gate=receiptPath/);
        chmodSync(receiptPath, 0o600);
    }

    const samePath = spawnSync(
        process.execPath,
        [verifier, '--receipt', receiptPath, '--approval', receiptPath],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(samePath.status, 0);
    assert.match(samePath.stderr, /gate=arguments/);

    copyFileSync(approvalPath, relocatedApprovalPath);
    const relocated = spawnSync(
        process.execPath,
        [verifier, '--receipt', receiptPath, '--approval', relocatedApprovalPath],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(relocated.status, 0);
    assert.match(relocated.stderr, /gate=approvalBinding/);

    writeFileSync(receiptPath, Buffer.concat([receiptBytes, Buffer.from('\n')]));
    const changedBytes = spawnSync(
        process.execPath,
        [verifier, '--receipt', receiptPath, '--approval', approvalPath],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(changedBytes.status, 0);
    assert.match(changedBytes.stderr, /gate=approvalBinding/);

    receipt.canonicalSha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    const changedCanonicalReceipt = spawnSync(
        process.execPath,
        [verifier, '--receipt', receiptPath, '--approval', approvalPath],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(changedCanonicalReceipt.status, 0);
    assert.match(changedCanonicalReceipt.stderr, /gate=receiptCanonicalHash/);

    writeFileSync(receiptPath, receiptBytes, { mode: 0o600 });
    approval.canonicalSha256 =
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    writeFileSync(approvalPath, JSON.stringify(approval), { mode: 0o600 });
    const changedCanonicalApproval = spawnSync(
        process.execPath,
        [verifier, '--receipt', receiptPath, '--approval', approvalPath],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(changedCanonicalApproval.status, 0);
    assert.match(changedCanonicalApproval.stderr, /gate=approvalBinding/);
});
