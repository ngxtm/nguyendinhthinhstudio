import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OWNER = 'ngxtm';
const REPOSITORY = 'nguyendinhthinhstudio';
const RULESET_NAME = 'main-image-upload-required-checks';
const MAIN_REF = 'refs/heads/main';
const REQUIRED_CONTEXTS = [
    'backend-image-upload',
    'image-upload-packaging',
    'frontend-playwright-chromium',
    'frontend-stable-chrome',
    'frontend-image-memory',
];
const root = resolve(import.meta.dirname, '..');
const payloadPath = resolve(root, 'docs/runbooks/image-upload-github-ruleset.json');

function fail(message) {
    throw new Error(`image-upload ruleset contract: ${message}`);
}

function exactStrings(actual, expected, label) {
    assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} must be exact`);
}

function requiredStatusRule(rules) {
    const matches = rules.filter((rule) => rule.type === 'required_status_checks');
    if (matches.length !== 1) fail('exactly one required_status_checks rule is required');
    return matches[0];
}

function verifyContract(value, source) {
    assert.equal(value.name, RULESET_NAME, `${source} name`);
    assert.equal(value.target, 'branch', `${source} target`);
    assert.equal(value.enforcement, 'active', `${source} enforcement`);
    assert.deepEqual(value.bypass_actors, [], `${source} bypass actors`);
    exactStrings(value.conditions?.ref_name?.include ?? [], [MAIN_REF], `${source} ref include`);
    exactStrings(value.conditions?.ref_name?.exclude ?? [], [], `${source} ref exclude`);
    const rule = requiredStatusRule(value.rules ?? []);
    const parameters = rule.parameters ?? {};
    assert.equal(
        parameters.strict_required_status_checks_policy,
        true,
        `${source} strict status policy`,
    );
    assert.equal(parameters.do_not_enforce_on_create, false, `${source} enforce on create`);
    exactStrings(
        (parameters.required_status_checks ?? []).map((check) => check.context),
        REQUIRED_CONTEXTS,
        `${source} required contexts`,
    );
}

function ghApi(endpoint) {
    return JSON.parse(
        execFileSync('gh', ['api', endpoint], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }),
    );
}

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
verifyContract(payload, 'payload');
if (process.argv.includes('--payload-only')) {
    process.stdout.write('image-upload ruleset contract: payload verified\n');
    process.exit(0);
}
if (process.argv.length !== 2) fail('only --payload-only is accepted');

const rulesets = ghApi(`repos/${OWNER}/${REPOSITORY}/rulesets?per_page=100`);
const matches = rulesets.filter((ruleset) => ruleset.name === RULESET_NAME);
if (matches.length !== 1) {
    fail(`expected one ${RULESET_NAME} ruleset, found ${matches.length}`);
}
const rulesetId = matches[0].id;
if (!Number.isSafeInteger(rulesetId) || rulesetId <= 0) fail('ruleset ID is invalid');
const detail = ghApi(`repos/${OWNER}/${REPOSITORY}/rulesets/${rulesetId}`);
verifyContract(detail, 'readback');

try {
    ghApi(`repos/${OWNER}/${REPOSITORY}/branches/main/protection`);
} catch (error) {
    const stderr = error?.stderr?.toString?.() ?? '';
    if (!/HTTP 404|status code 404|Not Found/i.test(stderr)) throw error;
}

process.stdout.write(`image-upload ruleset contract: ruleset ${rulesetId} verified\n`);
