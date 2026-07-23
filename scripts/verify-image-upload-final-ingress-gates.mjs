/* global process */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createReleaseFingerprint } from './image-upload-release-fingerprint.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const fixtureRoot = resolve(scriptDirectory, 'fixtures/image-upload-final-ingress-gates');
const schemaPath = resolve(
    scriptDirectory,
    'schemas/image-upload-final-ingress-evidence.schema.json',
);
const productionSchemaPath = resolve(
    scriptDirectory,
    'schemas/image-upload-production-evidence.schema.json',
);
const smokeSchemaPath = resolve(
    scriptDirectory,
    'schemas/image-upload-operator-smoke-receipt.schema.json',
);
const drillSchemaPath = resolve(
    scriptDirectory,
    'schemas/image-upload-roll-forward-drill-receipt.schema.json',
);
const SHA256 = /^[a-f0-9]{64}$/;
const ZERO_GATES = [
    'activeUploads',
    'unterminalizedExpiredUploads',
    'unresolvedPromotions',
    'invalidResponseHeadSettlement',
    'invalidPromotionAuthority',
    'invalidCleanupAuthority',
    'invalidPromotionConflictEvidence',
    'openPromotionConflicts',
    'dueTemporaryCleanup',
    'unverifiedTemporaryCleanup',
    'unresolvedR2ImageDeletion',
    'invalidR2DeletionAuthority',
    'invalidNonR2DeletionDisposition',
    'legacyTerminalTempPresent',
    'legacyPreDispatchTempPresent',
    'corsMismatch',
];

class GateError extends Error {
    constructor(gate, message) {
        super(message);
        this.gate = gate;
    }
}

const fail = (gate, message) => {
    throw new GateError(gate, message);
};
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

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        fail('input', error instanceof Error ? error.message : 'invalid JSON');
    }
}

function ensureInside(root, path, gate) {
    const relation = relative(resolve(root), resolve(path));
    if (relation.startsWith('..') || isAbsolute(relation)) fail(gate, 'path escapes root');
}

function protectedPath(path, gate) {
    if (!isAbsolute(path)) fail(gate, 'evidence path must be absolute');
    const absolute = resolve(path);
    const relation = relative(repositoryRoot, absolute);
    if (!relation.startsWith('..') && !isAbsolute(relation)) {
        fail(gate, 'production evidence must be outside repository');
    }
    const stats = statSync(absolute);
    if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
        fail(gate, 'production evidence must be owner-only');
    }
    return absolute;
}

function parseArguments(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const separator = argument.indexOf('=');
        const key = separator > 2 ? argument.slice(0, separator) : argument;
        const value = separator > 2 ? argument.slice(separator + 1) : argv[(index += 1)];
        if (!key.startsWith('--') || !value || value.startsWith('--') || values.has(key)) {
            fail('arguments', 'options require one unique value');
        }
        values.set(key, value);
    }
    if (values.has('--fixture')) {
        if (process.env.NODE_ENV !== 'test' || values.size !== 1) {
            fail('arguments', 'fixture mode is test-only and exclusive');
        }
        const fixture = resolve(values.get('--fixture'));
        ensureInside(fixtureRoot, fixture, 'arguments');
        return { mode: 'fixture', fixture };
    }
    const names = [
        '--receipt',
        '--approval',
        '--post-start-receipt',
        '--post-start-approval',
        '--smoke-authorization',
        '--smoke-receipt',
        '--drill-receipt',
        '--drill-approval',
    ];
    if (values.size !== names.length || names.some((name) => !values.has(name))) {
        fail('arguments', 'production mode requires all final-ingress evidence inputs');
    }
    const paths = Object.fromEntries(
        names.map((name) => [
            name.slice(2).replaceAll('-', '_'),
            protectedPath(values.get(name), name),
        ]),
    );
    if (new Set(Object.values(paths)).size !== names.length) {
        fail('arguments', 'all final-ingress evidence paths must be distinct');
    }
    return { mode: 'production', paths };
}

function setPath(target, dottedPath, value) {
    const segments = dottedPath.split('.');
    let cursor = target;
    for (const segment of segments.slice(0, -1))
        cursor = cursor[Number.isNaN(Number(segment)) ? segment : Number(segment)];
    const last = segments.at(-1);
    cursor[Number.isNaN(Number(last)) ? last : Number(last)] = value;
}

function assertNoSensitiveMaterial(value, path = '$') {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertNoSensitiveMaterial(entry, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object') {
        if (typeof value === 'string' && /(X-Amz-|https?:\/\/)/i.test(value)) {
            fail('sensitiveMaterial', `forbidden material at ${path}`);
        }
        return;
    }
    for (const [key, entry] of Object.entries(value)) {
        if (
            /(secret|password|token|presigned|objectkey|etag|queue|dlq|eventrule|providerevent|consumer|replay)/i.test(
                key,
            )
        ) {
            fail('sensitiveMaterial', `forbidden field ${path}.${key}`);
        }
        assertNoSensitiveMaterial(entry, `${path}.${key}`);
    }
}

function loadFixture(path) {
    const fixture = readJson(path);
    if (!fixture.base) return { receipt: fixture, expectedGate: null };
    const receipt = structuredClone(readJson(resolve(dirname(path), fixture.base)));
    Object.entries(fixture.set).forEach(([pathKey, value]) => setPath(receipt, pathKey, value));
    return { receipt, expectedGate: fixture.expectedGate };
}

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(readJson(schemaPath));
const validateProduction = ajv.compile(readJson(productionSchemaPath));
const validateSmoke = ajv.compile(readJson(smokeSchemaPath));
const validateDrill = ajv.compile(readJson(drillSchemaPath));

function assertCanonical(value, gate) {
    if (value.canonicalSha256 !== canonicalSha256(value)) {
        fail(gate, 'canonical hash differs');
    }
}

function assertRelease(value, expected, gate) {
    if (
        JSON.stringify(value) !== JSON.stringify(expected) ||
        value.releaseFingerprint !== createReleaseFingerprint(value.commitSha)
    ) {
        fail(gate, 'release binding differs');
    }
}

function assertPathAndBytes(binding, prefix, path, bytes, gate) {
    if (
        binding[`${prefix}PathSha256`] !== sha256(resolve(path)) ||
        binding[`${prefix}Sha256`] !== sha256(bytes)
    ) {
        fail(gate, 'path/bytes binding differs');
    }
}

function assertApproval(path, receiptPath, receiptBytes, schemaVersion, gate) {
    const approval = readJson(path);
    const keys = [
        'schemaVersion',
        'receiptPathSha256',
        'receiptSha256',
        'approvalPathSha256',
        'approverFingerprintSha256',
        'approvedAt',
        'decision',
        'canonicalSha256',
    ];
    if (
        Object.keys(approval).sort().join('\0') !== keys.sort().join('\0') ||
        approval.schemaVersion !== schemaVersion ||
        approval.receiptPathSha256 !== sha256(resolve(receiptPath)) ||
        approval.receiptSha256 !== sha256(receiptBytes) ||
        approval.approvalPathSha256 !== sha256(resolve(path)) ||
        !SHA256.test(approval.approverFingerprintSha256) ||
        approval.decision !== 'approved' ||
        !Number.isFinite(Date.parse(approval.approvedAt))
    ) {
        fail(gate, 'approval closed contract differs');
    }
    assertCanonical(approval, gate);
    return approval;
}

function assertSmokeAuthorization(path, release) {
    const authorization = readJson(path);
    const keys = [
        'schemaVersion',
        'release',
        'operatorFingerprintSha256',
        'approvedAt',
        'decision',
        'canonicalSha256',
    ];
    if (
        Object.keys(authorization).sort().join('\0') !== keys.sort().join('\0') ||
        authorization.schemaVersion !== 'image-upload-operator-smoke-authorization/v1' ||
        !SHA256.test(authorization.operatorFingerprintSha256) ||
        authorization.decision !== 'approved'
    ) {
        fail('smokeBinding', 'smoke authorization closed contract differs');
    }
    assertRelease(authorization.release, release, 'smokeBinding');
    assertCanonical(authorization, 'smokeBinding');
    return authorization;
}

function assertReceipt(receipt) {
    if (!validate(receipt)) fail('schema', JSON.stringify(validate.errors));
    assertNoSensitiveMaterial(receipt);
    if (
        receipt.release.releaseFingerprint !== createReleaseFingerprint(receipt.release.commitSha)
    ) {
        fail('releaseFingerprintBinding', 'release fingerprint differs');
    }
    const [first, second] = receipt.pollingSnapshots;
    for (const snapshot of [first, second]) {
        for (const gate of ZERO_GATES) if (snapshot[gate] !== 0) fail(gate, `${gate} is non-zero`);
    }
    if (Date.parse(second.observedAt) - Date.parse(first.observedAt) < 30_000) {
        fail('snapshotBarrier', 'final snapshots must be at least 30 seconds apart');
    }
    if (receipt.rollForwardDrillDecision !== 'pass') {
        fail('rollForwardDrillDecision', 'roll-forward drill has not passed');
    }
}

function assertProductionBindings(input) {
    const paths = input.paths;
    const finalBytes = readFileSync(paths.receipt);
    const finalReceipt = readJson(paths.receipt);
    assertReceipt(finalReceipt);
    if (finalReceipt.receiptPathSha256 !== sha256(resolve(paths.receipt))) {
        fail('finalReceiptBinding', 'final receipt path differs');
    }
    assertCanonical(finalReceipt, 'finalReceiptBinding');

    const postStartBytes = readFileSync(paths.post_start_receipt);
    const postStart = readJson(paths.post_start_receipt);
    assertNoSensitiveMaterial(postStart);
    if (!validateProduction(postStart)) fail('postStartBinding', 'post-start schema differs');
    assertCanonical(postStart, 'postStartBinding');
    assertPathAndBytes(
        finalReceipt.postStart,
        'receipt',
        paths.post_start_receipt,
        postStartBytes,
        'postStartBinding',
    );
    const postStartApprovalBytes = readFileSync(paths.post_start_approval);
    assertPathAndBytes(
        finalReceipt.postStart,
        'approval',
        paths.post_start_approval,
        postStartApprovalBytes,
        'postStartBinding',
    );
    const postStartApproval = assertApproval(
        paths.post_start_approval,
        paths.post_start_receipt,
        postStartBytes,
        'image-upload-production-gate-approval/v3-post-start-polling',
        'postStartBinding',
    );
    const postStartRelease = {
        imageReference: postStart.release.imageReference,
        imageDigest: postStart.release.imageDigest,
        commitSha: postStart.release.commitSha,
        releaseFingerprint: postStart.release.releaseFingerprint,
    };
    assertRelease(postStartRelease, finalReceipt.release, 'postStartBinding');

    const smokeAuthorizationBytes = readFileSync(paths.smoke_authorization);
    const smokeAuthorization = assertSmokeAuthorization(
        paths.smoke_authorization,
        finalReceipt.release,
    );
    assertPathAndBytes(
        finalReceipt.smoke,
        'authorization',
        paths.smoke_authorization,
        smokeAuthorizationBytes,
        'smokeBinding',
    );
    const smokeBytes = readFileSync(paths.smoke_receipt);
    const smoke = readJson(paths.smoke_receipt);
    assertNoSensitiveMaterial(smoke);
    if (!validateSmoke(smoke)) fail('smokeBinding', 'smoke receipt schema differs');
    assertCanonical(smoke, 'smokeBinding');
    assertRelease(smoke.release, finalReceipt.release, 'smokeBinding');
    if (
        smoke.receiptPathSha256 !== sha256(resolve(paths.smoke_receipt)) ||
        smoke.authorizationPathSha256 !== sha256(resolve(paths.smoke_authorization)) ||
        smoke.authorizationSha256 !== sha256(smokeAuthorizationBytes)
    ) {
        fail('smokeBinding', 'smoke receipt authorization binding differs');
    }
    assertPathAndBytes(
        finalReceipt.smoke,
        'receipt',
        paths.smoke_receipt,
        smokeBytes,
        'smokeBinding',
    );

    const drillBytes = readFileSync(paths.drill_receipt);
    const drill = readJson(paths.drill_receipt);
    assertNoSensitiveMaterial(drill);
    if (!validateDrill(drill)) fail('drillBinding', 'drill receipt schema differs');
    assertCanonical(drill, 'drillBinding');
    assertRelease(drill.toRelease, finalReceipt.release, 'drillBinding');
    if (
        drill.fromRelease.commitSha === drill.toRelease.commitSha ||
        drill.fromRelease.releaseFingerprint !==
            createReleaseFingerprint(drill.fromRelease.commitSha) ||
        drill.receiptPathSha256 !== sha256(resolve(paths.drill_receipt)) ||
        drill.postStartReceiptSha256 !== sha256(postStartBytes) ||
        drill.postStartApprovalSha256 !== sha256(postStartApprovalBytes) ||
        drill.operatorSmokeReceiptSha256 !== sha256(smokeBytes)
    ) {
        fail('drillBinding', 'drill transition binding differs');
    }
    assertPathAndBytes(
        finalReceipt.drill,
        'receipt',
        paths.drill_receipt,
        drillBytes,
        'drillBinding',
    );
    const drillApprovalBytes = readFileSync(paths.drill_approval);
    assertPathAndBytes(
        finalReceipt.drill,
        'approval',
        paths.drill_approval,
        drillApprovalBytes,
        'drillBinding',
    );
    const drillApproval = assertApproval(
        paths.drill_approval,
        paths.drill_receipt,
        drillBytes,
        'image-upload-roll-forward-drill-approval/v1-polling',
        'drillBinding',
    );

    const firstSnapshotAt = Date.parse(finalReceipt.pollingSnapshots[0].observedAt);
    if (
        firstSnapshotAt < Date.parse(smoke.createdAt) ||
        firstSnapshotAt < Date.parse(drill.createdAt) ||
        Date.parse(finalReceipt.createdAt) <
            Date.parse(finalReceipt.pollingSnapshots[1].observedAt) ||
        Date.parse(smoke.createdAt) < Date.parse(smokeAuthorization.approvedAt) ||
        Date.parse(drillApproval.approvedAt) < Date.parse(drill.createdAt) ||
        Date.parse(postStartApproval.approvedAt) > Date.parse(smokeAuthorization.approvedAt)
    ) {
        fail('evidenceOrdering', 'final-ingress evidence ordering differs');
    }

    const finalApproval = assertApproval(
        paths.approval,
        paths.receipt,
        finalBytes,
        'image-upload-final-ingress-approval/v1-polling',
        'finalApprovalBinding',
    );
    if (Date.parse(finalApproval.approvedAt) < Date.parse(finalReceipt.createdAt)) {
        fail('evidenceOrdering', 'final approval predates final receipt');
    }
}

function main() {
    const input = parseArguments(process.argv.slice(2));
    if (input.mode === 'fixture') {
        const { receipt, expectedGate } = loadFixture(input.fixture);
        try {
            assertReceipt(receipt);
            if (expectedGate) fail('fixtureExpectation', `expected ${expectedGate}`);
            console.log('image-upload-final-ingress-gates: pass');
            return;
        } catch (error) {
            if (expectedGate && error instanceof GateError && error.gate !== expectedGate) {
                fail('fixtureExpectation', `expected ${expectedGate}, observed ${error.gate}`);
            }
            throw error;
        }
    }
    assertProductionBindings(input);
    console.log('image-upload-final-ingress-gates: pass');
}

try {
    main();
} catch (error) {
    const gate = error instanceof GateError ? error.gate : 'unexpected';
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`image-upload-final-ingress-gates: gate=${gate} error=${message}`);
    process.exitCode = 1;
}
