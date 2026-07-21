/* global process */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const schemaPath = resolve(scriptDirectory, 'schemas/image-upload-production-evidence.schema.json');
const fixtureRoot = resolve(scriptDirectory, 'fixtures/image-upload-production-gates');
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
const REQUIRED_CONTEXTS = [
    'backend-image-upload',
    'image-upload-packaging',
    'frontend-playwright-chromium',
];
const REQUIRED_MEMORY_CONTEXTS = ['optimized-chromium', 'full-decode-control', 'stable-chrome'];
const MEMORY_FIXTURE_SHA256 = '1ac11dd1c64d39e79bdd3682bb11871ee2619b07a86fb923ba8412ab6dc3d581';

class GateError extends Error {
    constructor(gate, message) {
        super(message);
        this.name = 'GateError';
        this.gate = gate;
    }
}

function fail(gate, message) {
    throw new GateError(gate, message);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

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

function canonicalSha256(value) {
    return sha256(JSON.stringify(stableValue(value)));
}

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        fail('input', `invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
}

function ensureInside(root, path, gate) {
    const relation = relative(resolve(root), resolve(path));
    if (relation.startsWith('..') || isAbsolute(relation)) {
        fail(gate, 'path escapes its allowed root');
    }
}

function assertProtectedAbsolutePath(path, gate) {
    if (!isAbsolute(path)) fail(gate, 'evidence path must be absolute');
    const absolute = resolve(path);
    const relation = relative(repositoryRoot, absolute);
    if (!relation.startsWith('..') && !isAbsolute(relation)) {
        fail(gate, 'production evidence must be outside the repository');
    }
    const stats = statSync(absolute);
    if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
        fail(gate, 'production evidence must have owner-only permissions');
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
        if (!key.startsWith('--') || !value || value.startsWith('--')) {
            fail('arguments', 'options require --name value or --name=value');
        }
        if (!['--fixture', '--receipt', '--approval'].includes(key)) {
            fail('arguments', `unknown option ${key}`);
        }
        if (values.has(key)) fail('arguments', `duplicate option ${key}`);
        values.set(key, value);
    }
    const fixture = values.get('--fixture');
    const receipt = values.get('--receipt');
    const approval = values.get('--approval');
    if (fixture) {
        if (process.env.NODE_ENV !== 'test') {
            fail('arguments', '--fixture is available only when NODE_ENV=test');
        }
        if (values.size !== 1) fail('arguments', 'fixture mode is exclusive');
        const absolute = resolve(fixture);
        ensureInside(fixtureRoot, absolute, 'arguments');
        return { mode: 'fixture', fixture: absolute };
    }
    if (!receipt || !approval || values.size !== 2) {
        fail('arguments', 'production mode requires one receipt and one approval');
    }
    const receiptPath = assertProtectedAbsolutePath(receipt, 'receiptPath');
    const approvalPath = assertProtectedAbsolutePath(approval, 'approvalPath');
    if (receiptPath === approvalPath) {
        fail('arguments', 'receipt and approval paths must be distinct');
    }
    return { mode: 'production', receiptPath, approvalPath };
}

function setPath(target, dottedPath, value) {
    const segments = dottedPath.split('.');
    let cursor = target;
    for (const segment of segments.slice(0, -1)) {
        const key = /^\d+$/.test(segment) ? Number(segment) : segment;
        if (cursor[key] === undefined || cursor[key] === null) {
            cursor[key] = {};
        }
        cursor = cursor[key];
    }
    const finalSegment = segments.at(-1);
    cursor[/^\d+$/.test(finalSegment) ? Number(finalSegment) : finalSegment] = value;
}

function loadFixture(path) {
    const fixture = readJson(path);
    if (!fixture.base) return { receipt: fixture, expectedGate: null };
    const allowedKeys = ['base', 'expectedGate', 'set'];
    if (
        !fixture ||
        typeof fixture !== 'object' ||
        Object.keys(fixture).some((key) => !allowedKeys.includes(key)) ||
        typeof fixture.base !== 'string' ||
        typeof fixture.expectedGate !== 'string' ||
        !fixture.set ||
        typeof fixture.set !== 'object' ||
        Array.isArray(fixture.set)
    ) {
        fail('fixture', 'invalid fail-fixture envelope');
    }
    const basePath = resolve(dirname(path), fixture.base);
    ensureInside(fixtureRoot, basePath, 'fixture');
    const receipt = structuredClone(readJson(basePath));
    for (const [dottedPath, value] of Object.entries(fixture.set)) {
        setPath(receipt, dottedPath, value);
    }
    return { receipt, expectedGate: fixture.expectedGate };
}

const schema = readJson(schemaPath);
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function assertSchema(receipt) {
    if (!validateSchema(receipt)) {
        const summary = (validateSchema.errors ?? [])
            .map((error) => `${error.instancePath || '/'} ${error.message}`)
            .join('; ');
        fail('schema', summary || 'schema validation failed');
    }
}

function assertNoSensitiveMaterial(value, path = '$') {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertNoSensitiveMaterial(entry, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object') {
        if (
            typeof value === 'string' &&
            /(X-Amz-|https?:\/\/|(?:^|\/)uploads\/|(?:^|\/)albums\/)/i.test(value)
        ) {
            fail('sensitiveMaterial', `forbidden material at ${path}`);
        }
        return;
    }
    for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase();
        if (
            /(secret|password|token|presigned|objectkey|etag|queue|dlq|eventrule|providerevent|consumer|replay)/.test(
                normalizedKey,
            ) ||
            normalizedKey === 'ack' ||
            normalizedKey.startsWith('acknowledg')
        ) {
            fail('sensitiveMaterial', `forbidden field ${path}.${key}`);
        }
        assertNoSensitiveMaterial(entry, `${path}.${key}`);
    }
}

function assertTimestampAtMost(reference, value, gate, maxAgeMs = null) {
    const referenceTime = Date.parse(reference);
    const valueTime = Date.parse(value);
    if (!Number.isFinite(referenceTime) || !Number.isFinite(valueTime)) {
        fail(gate, 'timestamp is invalid');
    }
    const age = referenceTime - valueTime;
    if (age < 0 || (maxAgeMs !== null && age > maxAgeMs)) {
        fail(gate, 'timestamp is stale or from the future');
    }
}

function assertSemanticGates(receipt) {
    assertNoSensitiveMaterial(receipt);
    const createdAt = receipt.createdAt;
    if (receipt.release.policyVersion !== `web-v1-${receipt.release.policyHash}`) {
        fail('policyBinding', 'policy version/hash binding differs');
    }
    for (const backup of Object.values(receipt.backups)) {
        assertTimestampAtMost(createdAt, backup.restoreVerifiedAt, 'backupRestore');
        if (backup.receiptPathSha256 === backup.approvalPathSha256) {
            fail('backupPathBinding', 'backup receipt and approval paths must differ');
        }
    }
    if (
        receipt.backups.preMigration.ciphertextSha256 ===
        receipt.backups.postBridge.ciphertextSha256
    ) {
        fail('backupBindingMismatch', 'pre/post backups must be distinct');
    }

    const roles = receipt.roles;
    if (
        roles.readyApiProcesses < 1 ||
        roles.readyApiProcesses !== roles.configuredApiProcesses ||
        roles.readyApiProcesses * roles.permitsPerProcess > 2
    ) {
        fail('replicaBudget', 'actual API process/decode budget is invalid');
    }
    if (roles.advisoryLockOwnerCount !== 1) {
        fail('advisoryLockOwnerCount', 'exactly one advisory-lock owner is required');
    }
    assertTimestampAtMost(createdAt, roles.heartbeatAt, 'staleHeartbeat', 120_000);
    for (const key of [
        'pendingSessionExpiryCompletedAt',
        'promotionRecoveryCompletedAt',
        'temporaryCleanupCompletedAt',
        'imageDeletionCompletedAt',
        'rateLimitCleanupCompletedAt',
    ]) {
        assertTimestampAtMost(createdAt, roles[key], `staleLoop:${key}`, 120_000);
    }

    const roleFingerprints = [
        roles.apiFingerprintSha256,
        roles.reconcilerFingerprintSha256,
        roles.cutoverFingerprintSha256,
    ];
    const credentialFingerprints = [
        receipt.provider.apiR2CredentialFingerprintSha256,
        receipt.provider.reconcilerR2CredentialFingerprintSha256,
        receipt.provider.cutoverR2CredentialFingerprintSha256,
        receipt.provider.imgproxyCredentialFingerprintSha256,
    ];
    if (
        new Set(roleFingerprints).size !== roleFingerprints.length ||
        new Set(credentialFingerprints).size !== credentialFingerprints.length
    ) {
        fail('credentialIsolation', 'process-role and R2 role fingerprints must be distinct');
    }
    if (
        receipt.provider.reconcileGraceMs !== 30_000 ||
        receipt.provider.reconcileCadenceMs !== 5_000
    ) {
        fail('pollingConfig', 'polling grace/cadence readback must be exactly 30000/5000 ms');
    }
    if (receipt.cutover.dispositionPathSha256.length !== receipt.cutover.dispositionSha256.length) {
        fail('dispositionPathBinding', 'disposition path/digest counts differ');
    }
    for (const key of ['backupBindingMismatchCount', 'dispositionInvalidCount']) {
        if (receipt.cutover[key] !== 0) fail(key, `${key} is non-zero`);
    }

    const [first, second] = receipt.pollingSnapshots;
    for (const snapshot of [first, second]) {
        assertTimestampAtMost(createdAt, snapshot.observedAt, 'pollingSnapshotTime');
        for (const gate of ZERO_GATES) {
            if (snapshot[gate] !== 0) fail(gate, `${gate} is non-zero`);
        }
    }
    if (Date.parse(second.observedAt) - Date.parse(first.observedAt) < 30_000) {
        fail('snapshotBarrier', 'polling snapshots must be at least 30 seconds apart');
    }

    if (JSON.stringify(receipt.ci.contexts) !== JSON.stringify(REQUIRED_CONTEXTS)) {
        fail('ciContexts', 'required CI contexts are not exact');
    }
    if (receipt.ci.enforcement !== 'active') {
        fail('rulesetEnforcement', 'ruleset enforcement is not active');
    }
    if (receipt.ci.bypassActorCount !== 0) {
        fail('rulesetBypass', 'ruleset bypass actors are present');
    }
    if (receipt.memory.fixtureSha256 !== MEMORY_FIXTURE_SHA256) {
        fail('memoryFixture', 'deterministic memory fixture digest differs');
    }
    if (
        receipt.memory.absoluteLimitBytes !== 536_870_912 ||
        receipt.memory.relativeLimitRatio !== 0.5 ||
        receipt.memory.optimizedDeltaBytes > receipt.memory.absoluteLimitBytes ||
        receipt.memory.optimizedDeltaBytes >
            receipt.memory.controlDeltaBytes * receipt.memory.relativeLimitRatio
    ) {
        fail('memoryDelta', 'manual memory delta exceeds its closed gate');
    }
    const memoryNames = receipt.memory.contexts.map((entry) => entry.name);
    if (
        JSON.stringify(memoryNames) !== JSON.stringify(REQUIRED_MEMORY_CONTEXTS) ||
        receipt.memory.contexts.some((entry) => entry.passed !== true)
    ) {
        fail('memoryContexts', 'manual memory contexts are incomplete');
    }
    if (receipt.rollForwardDrillDecision !== 'pass') {
        fail('rollForwardDrillDecision', 'roll-forward drill has not passed');
    }
    if (
        receipt.stagingReceiptPathSha256 === receipt.operatorSmokeReceiptPathSha256 ||
        receipt.stagingReceiptSha256 === receipt.operatorSmokeReceiptSha256
    ) {
        fail('acceptanceReceiptBinding', 'staging and operator-smoke evidence must differ');
    }
}

function assertProductionBinding(receipt, receiptBytes, receiptPath, approvalPath) {
    if (receipt.receiptPathSha256 !== sha256(resolve(receiptPath))) {
        fail('receiptPathBinding', 'receipt path hash differs');
    }
    if (receipt.canonicalSha256 !== canonicalSha256(receipt)) {
        fail('receiptCanonicalHash', 'receipt canonical hash differs');
    }
    const approval = readJson(approvalPath);
    const requiredKeys = [
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
        !approval ||
        typeof approval !== 'object' ||
        Object.keys(approval).sort().join('\0') !== requiredKeys.sort().join('\0') ||
        approval.schemaVersion !== 'image-upload-production-gate-approval/v2-polling' ||
        approval.decision !== 'approved' ||
        !SHA256.test(approval.approverFingerprintSha256) ||
        approval.receiptPathSha256 !== sha256(resolve(receiptPath)) ||
        approval.approvalPathSha256 !== sha256(resolve(approvalPath)) ||
        approval.receiptSha256 !== sha256(receiptBytes) ||
        approval.canonicalSha256 !== canonicalSha256(approval)
    ) {
        fail('approvalBinding', 'production approval binding differs');
    }
    assertTimestampAtMost(approval.approvedAt, receipt.createdAt, 'approvalTime');
    if (Date.parse(approval.approvedAt) > Date.now()) {
        fail('approvalTime', 'approval is from the future');
    }
}

function verifyReceipt(receipt) {
    assertSchema(receipt);
    assertSemanticGates(receipt);
}

function main() {
    const input = parseArguments(process.argv.slice(2));
    if (input.mode === 'fixture') {
        const { receipt, expectedGate } = loadFixture(input.fixture);
        try {
            verifyReceipt(receipt);
            if (expectedGate !== null) {
                fail('fixtureExpectation', `fixture unexpectedly passed; expected ${expectedGate}`);
            }
            console.log('image-upload-production-gates: pass');
            return;
        } catch (error) {
            if (
                expectedGate !== null &&
                error instanceof GateError &&
                error.gate !== expectedGate
            ) {
                fail('fixtureExpectation', `expected ${expectedGate}, observed ${error.gate}`);
            }
            throw error;
        }
    }

    const receiptBytes = readFileSync(input.receiptPath);
    const receipt = readJson(input.receiptPath);
    verifyReceipt(receipt);
    assertProductionBinding(receipt, receiptBytes, input.receiptPath, input.approvalPath);
    console.log('image-upload-production-gates: pass');
}

try {
    main();
} catch (error) {
    const gate = error instanceof GateError ? error.gate : 'unexpected';
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`image-upload-production-gates: gate=${gate} error=${message}`);
    process.exitCode = 1;
}
