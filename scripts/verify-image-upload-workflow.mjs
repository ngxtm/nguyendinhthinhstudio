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
const required = ['backend-image-upload', 'image-upload-packaging', 'frontend-playwright-chromium'];
for (const id of ['frontend-stable-chrome', 'frontend-image-memory']) {
    if (jobs.has(id)) fail(`${id} must remain a manual release gate, not a GitHub Actions job`);
}

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
    'NDT_STAGING_DATABASE_URL: ${{ secrets.NDT_STAGING_DATABASE_URL }}',
    'NDT_STAGING_DIRECT_URL: ${{ secrets.NDT_STAGING_DIRECT_URL }}',
    'NDT_STAGING_SUPABASE_PROJECT_REF: ${{ vars.NDT_STAGING_SUPABASE_PROJECT_REF }}',
    'NDT_PRODUCTION_SUPABASE_PROJECT_REF: ${{ vars.NDT_PRODUCTION_SUPABASE_PROJECT_REF }}',
    'npx --no-install playwright install --with-deps chromium',
    'working-directory: apps/frontend',
    'image: darthsim/imgproxy:v3.30.1',
    "IMGPROXY_USE_S3: 'true'",
    'AWS_ACCESS_KEY_ID: ${{ secrets.NDT_STAGING_IMGPROXY_ACCESS_KEY_ID }}',
    'AWS_SECRET_ACCESS_KEY: ${{ secrets.NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY }}',
    'IMGPROXY_S3_ENDPOINT: ${{ vars.NDT_STAGING_R2_ENDPOINT }}',
    '- name: Upload sanitized staging receipt',
    'uses: actions/upload-artifact@v4',
    'name: image-upload-staging-receipt-${{ github.run_id }}-${{ github.run_attempt }}',
    'path: ${{ runner.temp }}/ndt-image-upload-staging-receipt.json',
    'if-no-files-found: error',
    'retention-days: 30',
]) {
    if (!staging.includes(fragment)) fail(`image-upload-staging must contain ${fragment}`);
}

const stagingStepsIndex = staging.indexOf('\n        steps:');
const stagingJobConfiguration = staging.slice(0, stagingStepsIndex);
const receiptPathExpression = '${{ runner.temp }}/ndt-image-upload-staging-receipt.json';
if (stagingStepsIndex < 0 || stagingJobConfiguration.includes('${{ runner.temp }}')) {
    fail('image-upload-staging must not use runner context in job-level configuration');
}
for (const [name, pattern] of [
    [
        'qualification',
        /- name: Run staging qualification\s+env:\s+NDT_STAGING_RECEIPT_PATH: \$\{\{ runner\.temp \}\}\/ndt-image-upload-staging-receipt\.json\s+run:/,
    ],
    [
        'cleanup',
        /- name: Cleanup staging run\s+if: always\(\)\s+env:\s+NDT_STAGING_RECEIPT_PATH: \$\{\{ runner\.temp \}\}\/ndt-image-upload-staging-receipt\.json\s+run:/,
    ],
]) {
    if (!pattern.test(staging)) {
        fail(`image-upload-staging ${name} step must receive runner-scoped receipt path`);
    }
}
if (staging.split(receiptPathExpression).length - 1 !== 3) {
    fail('image-upload-staging must use one exact runner-scoped receipt path in three steps');
}

const stagingCleanupIndex = staging.indexOf('- name: Cleanup staging run');
const stagingUploadIndex = staging.indexOf('- name: Upload sanitized staging receipt');
if (
    stagingCleanupIndex < 0 ||
    stagingUploadIndex < 0 ||
    stagingUploadIndex <= stagingCleanupIndex ||
    !/- name: Upload sanitized staging receipt[\s\S]*?\n\s+if:\s*always\(\)/.test(staging)
) {
    fail('image-upload-staging must upload sanitized receipt after cleanup');
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
    'docker build --build-arg "IMAGE_UPLOAD_RELEASE_COMMIT=$IMAGE_UPLOAD_RELEASE_COMMIT" -f apps/backend/Dockerfile',
    'docker build -f apps/frontend/Dockerfile',
    'docker compose config --quiet',
]);
requireFragments(jobs.get('frontend-playwright-chromium'), 'frontend-playwright-chromium', [
    'npx --no-install playwright install --with-deps chromium',
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
for (const id of ['frontend-playwright-chromium']) {
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

assert.equal(required.length, 3);
process.stdout.write('image-upload workflow contract: 3 required jobs verified\n');
