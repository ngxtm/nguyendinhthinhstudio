/* global process */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    chmodSync,
    existsSync,
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
const verifier = resolve(scriptsDirectory, 'verify-image-upload-final-ingress-gates.mjs');
const fixtureRoot = resolve(scriptsDirectory, 'fixtures/image-upload-final-ingress-gates');
const passFixture = resolve(fixtureRoot, 'pass.json');
const schemaPath = resolve(
    scriptsDirectory,
    'schemas/image-upload-final-ingress-evidence.schema.json',
);
const productionPassFixture = resolve(
    scriptsDirectory,
    'fixtures/image-upload-production-gates/pass.json',
);

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

function writeCanonical(path, draft) {
    const value = { ...draft, canonicalSha256: canonicalSha256(draft) };
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    return { value, bytes: readFileSync(path) };
}

function runFixture(path = passFixture, nodeEnv = 'test') {
    return spawnSync(process.execPath, [verifier, '--fixture', path], {
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
    Object.entries(value).forEach(([key, entry]) =>
        assertEveryObjectIsClosed(entry, `${path}.${key}`),
    );
}

test('final-ingress schema is closed and binds both admission phases', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    assertEveryObjectIsClosed(schema);
    const validate = new Ajv({ allErrors: true, strict: true });
    addFormats(validate);
    const compiled = validate.compile(schema);
    const fixture = JSON.parse(readFileSync(passFixture, 'utf8'));
    assert.equal(compiled(fixture), true, JSON.stringify(compiled.errors));
    assert.equal(fixture.rollForwardDrillDecision, 'pass');
    assert.deepEqual(Object.keys(fixture.postStart).sort(), [
        'approvalPathSha256',
        'approvalSha256',
        'receiptPathSha256',
        'receiptSha256',
    ]);
    assert.deepEqual(Object.keys(fixture.smoke).sort(), [
        'authorizationPathSha256',
        'authorizationSha256',
        'receiptPathSha256',
        'receiptSha256',
    ]);
});

test('fixture mode passes only in tests and every fail fixture names its gate', () => {
    const accepted = runFixture();
    assert.equal(accepted.status, 0, accepted.stderr);
    const rejected = runFixture(passFixture, 'production');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /gate=arguments/);

    for (const name of readdirSync(resolve(fixtureRoot, 'fail')).sort()) {
        const path = resolve(fixtureRoot, 'fail', name);
        const fixture = JSON.parse(readFileSync(path, 'utf8'));
        const result = runFixture(path);
        assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
        assert.match(result.stderr, new RegExp(`gate=${fixture.expectedGate}(?:\\s|$)`), name);
    }
});

test('production mode requires every distinct protected evidence input', () => {
    const result = spawnSync(process.execPath, [verifier], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /gate=arguments/);
});

test('production mode binds every protected phase and active release', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ndt-final-ingress-'));
    chmodSync(directory, 0o700);
    const paths = Object.fromEntries(
        [
            'receipt',
            'approval',
            'post-start-receipt',
            'post-start-approval',
            'smoke-authorization',
            'smoke-receipt',
            'drill-receipt',
            'drill-approval',
        ].map((name) => [name, join(directory, `${name}.json`)]),
    );
    const release = JSON.parse(readFileSync(passFixture, 'utf8')).release;

    const postStart = JSON.parse(readFileSync(productionPassFixture, 'utf8'));
    postStart.release.imageReference = release.imageReference;
    postStart.release.imageDigest = release.imageDigest;
    postStart.release.imageCommitSha = release.commitSha;
    postStart.release.commitSha = release.commitSha;
    postStart.release.releaseFingerprint = release.releaseFingerprint;
    postStart.roles.apiImageDigest = release.imageDigest;
    postStart.roles.migrationImageDigest = release.imageDigest;
    postStart.roles.reconcilerImageDigest = release.imageDigest;
    postStart.roles.reconcilerEnvironmentBuildFingerprint = release.releaseFingerprint;
    postStart.roles.heartbeatBuildFingerprint = release.releaseFingerprint;
    postStart.receiptPathSha256 = sha256(resolve(paths['post-start-receipt']));
    const postStartWritten = writeCanonical(paths['post-start-receipt'], postStart);

    const postStartApprovalDraft = {
        schemaVersion: 'image-upload-production-gate-approval/v3-post-start-polling',
        receiptPathSha256: sha256(resolve(paths['post-start-receipt'])),
        receiptSha256: sha256(postStartWritten.bytes),
        approvalPathSha256: sha256(resolve(paths['post-start-approval'])),
        approverFingerprintSha256: 'd'.repeat(64),
        approvedAt: '2026-07-23T05:01:00.000Z',
        decision: 'approved',
    };
    const postStartApproval = writeCanonical(paths['post-start-approval'], postStartApprovalDraft);

    const smokeAuthorizationDraft = {
        schemaVersion: 'image-upload-operator-smoke-authorization/v1',
        release,
        operatorFingerprintSha256: 'e'.repeat(64),
        approvedAt: '2026-07-23T05:02:00.000Z',
        decision: 'approved',
    };
    const smokeAuthorization = writeCanonical(
        paths['smoke-authorization'],
        smokeAuthorizationDraft,
    );
    const smokeDraft = {
        schemaVersion: 'image-upload-operator-smoke-receipt/v1-polling',
        receiptId: '10000000-0000-4000-8000-000000000010',
        receiptPathSha256: sha256(resolve(paths['smoke-receipt'])),
        createdAt: '2026-07-23T05:05:00.000Z',
        release,
        authorizationPathSha256: sha256(resolve(paths['smoke-authorization'])),
        authorizationSha256: sha256(smokeAuthorization.bytes),
        checks: Object.fromEntries(
            [
                'browserUpload',
                'absoluteExpiryRetry',
                'allowedCorsPut',
                'deniedCorsPut',
                'responseFirstSettlement',
                'copyResponseLossHeadSettlement',
                'unchangedDestinationRetry',
                'conflictFailClosed',
                'committedDeletion',
                'failedPromotionCleanup',
                'temporaryCleanupAfterExpiry',
                'imgproxyRendering',
            ].map((name) => [name, true]),
        ),
    };
    const smoke = writeCanonical(paths['smoke-receipt'], smokeDraft);

    const drillDraft = {
        schemaVersion: 'image-upload-roll-forward-drill-receipt/v1-polling',
        receiptId: '10000000-0000-4000-8000-000000000011',
        receiptPathSha256: sha256(resolve(paths['drill-receipt'])),
        createdAt: '2026-07-23T05:08:50.000Z',
        fromRelease: {
            imageReference: 'ndt-studio-backend:bbbbbbbbbbbb',
            imageDigest: `sha256:${'b'.repeat(64)}`,
            commitSha: 'b'.repeat(40),
            releaseFingerprint:
                'sha256:e26d2da3ab585c9840b157a4a9b5639fda905c2ad33d04d2c598be8883b51236',
        },
        toRelease: release,
        postStartReceiptSha256: sha256(postStartWritten.bytes),
        postStartApprovalSha256: sha256(postStartApproval.bytes),
        operatorSmokeReceiptSha256: sha256(smoke.bytes),
        presignDisabledAtStart: true,
        generalIngressBlockedAtStart: true,
        forwardOnlyMigrations: true,
        decision: 'pass',
    };
    const drill = writeCanonical(paths['drill-receipt'], drillDraft);
    const drillApprovalDraft = {
        schemaVersion: 'image-upload-roll-forward-drill-approval/v1-polling',
        receiptPathSha256: sha256(resolve(paths['drill-receipt'])),
        receiptSha256: sha256(drill.bytes),
        approvalPathSha256: sha256(resolve(paths['drill-approval'])),
        approverFingerprintSha256: 'a'.repeat(64),
        approvedAt: '2026-07-23T05:09:00.000Z',
        decision: 'approved',
    };
    const drillApproval = writeCanonical(paths['drill-approval'], drillApprovalDraft);

    const finalReceipt = JSON.parse(readFileSync(passFixture, 'utf8'));
    finalReceipt.receiptPathSha256 = sha256(resolve(paths.receipt));
    finalReceipt.postStart = {
        receiptPathSha256: sha256(resolve(paths['post-start-receipt'])),
        receiptSha256: sha256(postStartWritten.bytes),
        approvalPathSha256: sha256(resolve(paths['post-start-approval'])),
        approvalSha256: sha256(postStartApproval.bytes),
    };
    finalReceipt.smoke = {
        authorizationPathSha256: sha256(resolve(paths['smoke-authorization'])),
        authorizationSha256: sha256(smokeAuthorization.bytes),
        receiptPathSha256: sha256(resolve(paths['smoke-receipt'])),
        receiptSha256: sha256(smoke.bytes),
    };
    finalReceipt.drill = {
        receiptPathSha256: sha256(resolve(paths['drill-receipt'])),
        receiptSha256: sha256(drill.bytes),
        approvalPathSha256: sha256(resolve(paths['drill-approval'])),
        approvalSha256: sha256(drillApproval.bytes),
    };
    const finalWritten = writeCanonical(paths.receipt, finalReceipt);
    const finalApprovalDraft = {
        schemaVersion: 'image-upload-final-ingress-approval/v1-polling',
        receiptPathSha256: sha256(resolve(paths.receipt)),
        receiptSha256: sha256(finalWritten.bytes),
        approvalPathSha256: sha256(resolve(paths.approval)),
        approverFingerprintSha256: '9'.repeat(64),
        approvedAt: '2026-07-23T05:11:00.000Z',
        decision: 'approved',
    };
    const finalApproval = writeCanonical(paths.approval, finalApprovalDraft);

    const args = Object.entries(paths).flatMap(([name, path]) => [`--${name}`, path]);
    const accepted = spawnSync(process.execPath, [verifier, ...args], { encoding: 'utf8' });
    assert.equal(accepted.status, 0, accepted.stderr);

    writeFileSync(paths['smoke-receipt'], Buffer.concat([smoke.bytes, Buffer.from('\n')]));
    const changedSmoke = spawnSync(process.execPath, [verifier, ...args], { encoding: 'utf8' });
    assert.notEqual(changedSmoke.status, 0);
    assert.match(changedSmoke.stderr, /gate=smokeBinding/);

    writeFileSync(paths['smoke-receipt'], smoke.bytes, { mode: 0o600 });
    writeCanonical(paths.approval, {
        ...finalApproval.value,
        approvedAt: '2026-07-23T05:09:59.999Z',
    });
    const earlyApproval = spawnSync(process.execPath, [verifier, ...args], {
        encoding: 'utf8',
    });
    assert.notEqual(earlyApproval.status, 0);
    assert.match(earlyApproval.stderr, /gate=evidenceOrdering/);
});

test('runbooks order both admission phases before evidence-driven cleanup', () => {
    const rollForward = readFileSync(
        resolve(scriptsDirectory, '../docs/runbooks/image-upload-roll-forward.md'),
        'utf8',
    );
    const cleanup = readFileSync(
        resolve(scriptsDirectory, '../docs/runbooks/image-upload-evidence-cleanup.md'),
        'utf8',
    );
    const orderedMarkers = [
        'Phase 1 post-start approval',
        'operator-only ingress and smoke',
        'roll-forward drill ending at the active release',
        'two final zero polling snapshots',
        'Phase 2 final-ingress approval',
        'open general ingress',
        'rollback-window cleanup',
    ];
    let previous = -1;
    for (const marker of orderedMarkers) {
        const index = rollForward.indexOf(marker, previous + 1);
        assert.ok(index > previous, `missing or out-of-order marker: ${marker}`);
        previous = index;
    }
    for (const marker of [
        'dry-run by default',
        'encrypted database backups are never deleted',
        'image referenced by any container',
        'rollback window',
        'credential revocation',
    ]) {
        assert.ok(cleanup.includes(marker), `cleanup contract is missing: ${marker}`);
    }
});

test('the superseded browser memory benchmark is absent', () => {
    const repositoryRoot = resolve(scriptsDirectory, '..');
    assert.equal(
        existsSync(
            resolve(
                repositoryRoot,
                'apps/frontend/test/benchmark/image-upload-memory.benchmark.ts',
            ),
        ),
        false,
    );
});

test('operator smoke receipt is emitted only by the journal-backed runner', () => {
    const repositoryRoot = resolve(scriptsDirectory, '..');
    const contract = readFileSync(
        resolve(
            repositoryRoot,
            'apps/backend/src/scripts/image-upload-production-smoke-contract.ts',
        ),
        'utf8',
    );
    const orchestrator = readFileSync(
        resolve(
            repositoryRoot,
            'apps/backend/src/scripts/image-upload-production-smoke-orchestrator.ts',
        ),
        'utf8',
    );
    const dependencies = readFileSync(
        resolve(
            repositoryRoot,
            'apps/backend/src/scripts/image-upload-production-smoke-dependencies.ts',
        ),
        'utf8',
    );

    assert.match(contract, /completedChecks: readonly ProductionSmokeCheck\[\]/);
    assert.match(contract, /writeSmokeReceipt/);
    assert.match(orchestrator, /for \(const check of PRODUCTION_SMOKE_CHECKS\)/);
    assert.match(orchestrator, /cleanupStatus !== 'complete'/);
    for (const check of [
        'browserUpload',
        'absoluteExpiryRetry',
        'allowedCorsPut',
        'deniedCorsPut',
        'responseFirstSettlement',
        'copyResponseLossHeadSettlement',
        'unchangedDestinationRetry',
        'conflictFailClosed',
        'committedDeletion',
        'failedPromotionCleanup',
        'temporaryCleanupAfterExpiry',
        'imgproxyRendering',
    ]) {
        assert.match(dependencies, new RegExp(`case '${check}'`));
    }
    assert.doesNotMatch(dependencies, /browserUpload:\s*true/);
});
