import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workflowPath = resolve(root, '.github/workflows/image-upload.yml');

function read(path) {
    return readFileSync(resolve(root, path), 'utf8');
}

function fail(message) {
    throw new Error(`image-upload workflow contract: ${message}`);
}

function extractJobs(source) {
    const jobs = new Map();
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    let inJobs = false;
    let current;
    let jobIndent;
    for (const line of lines) {
        if (/^jobs:\s*$/.test(line)) {
            inJobs = true;
            continue;
        }
        if (!inJobs) continue;
        if (/^[A-Za-z][\w-]*:\s*$/.test(line)) break;
        const job = /^(\s+)([a-z0-9-]+):\s*$/.exec(line);
        if (job && (jobIndent === undefined || job[1].length === jobIndent)) {
            jobIndent ??= job[1].length;
            current = job[2];
            jobs.set(current, []);
            continue;
        }
        if (current) jobs.get(current).push(line);
    }
    return new Map([...jobs].map(([id, body]) => [id, body.join('\n')]));
}

function requireFragments(body, job, fragments) {
    for (const fragment of fragments) {
        if (!body.includes(fragment)) fail(`${job} must execute ${fragment}`);
    }
}

const source = readFileSync(workflowPath, 'utf8');
const jobs = extractJobs(source);
const required = [
    'backend-image-upload',
    'image-upload-packaging',
    'frontend-playwright-chromium',
    'frontend-stable-chrome',
    'frontend-image-memory',
];

const staging = jobs.get('image-upload-staging');
if (!staging) fail('missing image-upload-staging job');
if (!/^\s+if:\s*github\.event_name\s*==\s*['"]workflow_dispatch['"]\s*$/m.test(staging)) {
    fail('image-upload-staging must run only for workflow_dispatch');
}
for (const fragment of [
    'environment: staging',
    'group: image-upload-staging',
    'cancel-in-progress: false',
    'npm run test:staging:run --workspace=backend',
    'if: always()',
    'npm run test:staging:cleanup --workspace=backend',
]) {
    if (!staging.includes(fragment)) fail(`image-upload-staging must contain ${fragment}`);
}

for (const id of required) {
    const body = jobs.get(id);
    if (!body) fail(`missing required job ${id}`);
    if (!new RegExp(`^\\s+name:\\s*["']?${id}["']?\\s*$`, 'm').test(body)) {
        fail(`${id} effective name must equal its ruleset context`);
    }
    if (/continue-on-error\s*:/i.test(body)) {
        fail(`${id} must not use continue-on-error`);
    }
    if (/^\s+if\s*:/m.test(body)) {
        fail(`${id} must not be conditionally skipped`);
    }
}

requireFragments(jobs.get('backend-image-upload'), 'backend-image-upload', [
    'npm run test:image-upload:ci --workspace=backend',
]);
requireFragments(jobs.get('image-upload-packaging'), 'image-upload-packaging', [
    'docker build -f apps/backend/Dockerfile',
    'docker build -f apps/frontend/Dockerfile',
    'docker compose config --quiet',
]);
requireFragments(jobs.get('frontend-playwright-chromium'), 'frontend-playwright-chromium', [
    'npx --no-install playwright install --with-deps chromium',
    '--project=chromium',
]);
requireFragments(jobs.get('frontend-stable-chrome'), 'frontend-stable-chrome', [
    'chrome-for-testing-public',
    'CFT_EXECUTABLE_PATH',
    '--project=stable-chrome',
]);
requireFragments(jobs.get('frontend-image-memory'), 'frontend-image-memory', [
    'generate-image-upload-memory-fixture.ts',
    'IMAGE_UPLOAD_MEMORY_FIXTURE',
    'image-upload-memory.benchmark.ts',
    '--project=chromium',
]);

const cftVersion = /CHROME_FOR_TESTING_VERSION:\s*["']?([0-9]+(?:\.[0-9]+){3})["']?/.exec(source);
if (!cftVersion || Number(cftVersion[1].split('.')[0]) < 136) {
    fail('Chrome for Testing must be pinned to a four-part version >=136');
}
if (/channel:\s*(?:stable|chrome)\b/i.test(source)) {
    fail('workflow must not select an unpinned browser channel');
}

const backendPackage = JSON.parse(read('apps/backend/package.json'));
const backendScripts = backendPackage.scripts ?? {};
for (const name of [
    'test:image-upload:unit',
    'test:image-upload:integration',
    'test:image-upload:ci',
]) {
    if (typeof backendScripts[name] !== 'string') {
        fail(`backend package is missing ${name}`);
    }
}
if (
    !backendScripts['test:image-upload:ci'].includes('npm run test:image-upload:unit') ||
    !backendScripts['test:image-upload:ci'].includes('npm run test:image-upload:integration')
) {
    fail('test:image-upload:ci must invoke both closed component scripts');
}
for (const name of ['test:image-upload:unit', 'test:image-upload:integration']) {
    const command = backendScripts[name];
    if (
        !/\b(?:src|test)\/[\w./-]+(?:spec|test)\.ts\b/.test(command) ||
        !command.includes('--runTestsByPath')
    ) {
        fail(`${name} must contain an explicit committed test-path list`);
    }
}

const frontendPackage = JSON.parse(read('apps/frontend/package.json'));
if (frontendPackage.scripts?.['test:focused'] !== 'node --import tsx --test') {
    fail('frontend test:focused must be exactly node --import tsx --test');
}
for (const id of ['frontend-playwright-chromium', 'frontend-stable-chrome']) {
    const body = jobs.get(id);
    if (/\bnode\s+--test\b/.test(body)) {
        fail(`${id} must not use bare node --test`);
    }
    if (body.includes('npm run test:focused') && !/test\/[\w./*-]+\.test\.ts/.test(body)) {
        fail(`${id} must pass explicit frontend test paths to test:focused`);
    }
}

const playwright = read('apps/frontend/playwright.config.ts');
if (!/name:\s*['"]chromium['"]/.test(playwright)) {
    fail('Playwright chromium project is missing');
}
if (!/name:\s*['"]stable-chrome['"]/.test(playwright)) {
    fail('Playwright stable-chrome project is missing');
}
if (!playwright.includes('CFT_EXECUTABLE_PATH')) {
    fail('stable-chrome must fail closed through CFT_EXECUTABLE_PATH');
}
if (/name:\s*['"]chromium['"][\s\S]{0,200}channel\s*:/m.test(playwright)) {
    fail('bundled chromium project must not use a system channel');
}

const benchmark = read('apps/frontend/test/benchmark/image-upload-memory.benchmark.ts');
for (const label of ['optimizedDeltaBytes', 'controlDeltaBytes', 'ratio']) {
    if (!benchmark.includes(label)) fail(`memory benchmark must emit ${label}`);
}

assert.equal(required.length, 5);
process.stdout.write('image-upload workflow contract: 5 required jobs verified\n');
