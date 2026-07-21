import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { IMAGE_GRAMMAR_FIXTURES, classifySource, validateStored } from '../src/index.ts';

test('deterministic fixture corpus has stable classify and stored decisions', async () => {
    assert.ok(IMAGE_GRAMMAR_FIXTURES.length >= 16);
    const ids = new Set<string>();

    for (const fixture of IMAGE_GRAMMAR_FIXTURES) {
        assert.equal(ids.has(fixture.id), false, fixture.id);
        ids.add(fixture.id);

        const classify = await classifySource(fixture.input(), fixture.policy);
        const stored = await validateStored(fixture.input(), fixture.policy);

        assert.deepEqual(classify, fixture.expectedClassify, fixture.id);
        assert.deepEqual(stored, fixture.expectedStored, fixture.id);
    }
});

test('corpus contains all eight orientation signatures and unsafe vectors', () => {
    assert.deepEqual(
        IMAGE_GRAMMAR_FIXTURES.filter((fixture) => fixture.orientation !== null)
            .map((fixture) => fixture.orientation)
            .sort(),
        [1, 2, 3, 4, 5, 6, 7, 8],
    );
    for (const category of [
        'srgb',
        'wide-gamut',
        'intrinsic-alpha',
        'bad-length',
        'bad-crc',
        'bad-padding',
        'trailing-bytes',
        'unknown-metadata',
    ]) {
        assert.ok(
            IMAGE_GRAMMAR_FIXTURES.some((fixture) => fixture.category === category),
            category,
        );
    }
});

test('orientation fixtures decode to deterministic display corner signatures', async () => {
    const expected = new Map([
        [1, { width: 64, height: 48, corners: ['red', 'green', 'blue', 'yellow'] }],
        [2, { width: 64, height: 48, corners: ['green', 'red', 'yellow', 'blue'] }],
        [3, { width: 64, height: 48, corners: ['yellow', 'blue', 'green', 'red'] }],
        [4, { width: 64, height: 48, corners: ['blue', 'yellow', 'red', 'green'] }],
        [5, { width: 48, height: 64, corners: ['red', 'blue', 'green', 'yellow'] }],
        [6, { width: 48, height: 64, corners: ['blue', 'red', 'yellow', 'green'] }],
        [7, { width: 48, height: 64, corners: ['yellow', 'green', 'blue', 'red'] }],
        [8, { width: 48, height: 64, corners: ['green', 'yellow', 'red', 'blue'] }],
    ] as const);
    const references = {
        red: [255, 0, 0],
        green: [0, 255, 0],
        blue: [0, 0, 255],
        yellow: [255, 255, 0],
    } as const;

    for (const fixture of IMAGE_GRAMMAR_FIXTURES.filter(
        (candidate) => candidate.orientation !== null,
    )) {
        const declared = (
            fixture as typeof fixture & {
                cornerSignature?: {
                    displayWidth: number;
                    displayHeight: number;
                    corners: readonly string[];
                };
            }
        ).cornerSignature;
        assert.ok(declared, fixture.id);

        const chunks: Uint8Array[] = [];
        for await (const chunk of fixture.input()) chunks.push(chunk);
        const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
        const { data, info } = await sharp(bytes)
            .autoOrient()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const vector = expected.get(fixture.orientation!);
        assert.ok(vector);
        assert.equal(info.width, vector.width, fixture.id);
        assert.equal(info.height, vector.height, fixture.id);

        const sample = (x: number, y: number) => {
            const offset = (y * info.width + x) * info.channels;
            const pixel = [data[offset], data[offset + 1], data[offset + 2]];
            return Object.entries(references).sort((left, right) => {
                const distance = ([, rgb]: readonly [string, readonly number[]]) =>
                    rgb.reduce((sum, value, index) => sum + (value - pixel[index]) ** 2, 0);
                return distance(left) - distance(right);
            })[0][0];
        };
        const inset = 4;
        const corners = [
            sample(inset, inset),
            sample(info.width - 1 - inset, inset),
            sample(inset, info.height - 1 - inset),
            sample(info.width - 1 - inset, info.height - 1 - inset),
        ];
        assert.deepEqual(corners, vector.corners, fixture.id);
        assert.deepEqual(declared, {
            displayWidth: vector.width,
            displayHeight: vector.height,
            corners: vector.corners,
        });
    }
});

test('corpus includes a structurally valid policy-allowlisted ICC vector', () => {
    const fixture = IMAGE_GRAMMAR_FIXTURES.find(
        (candidate) => candidate.id === 'png-wide-gamut-icc-allowed',
    );
    assert.ok(fixture);
    assert.equal(fixture.expectedStored.outcome, 'allowed');
    if (fixture.expectedStored.outcome === 'allowed') {
        assert.ok(fixture.expectedStored.facts.iccSha256);
        assert.deepEqual(fixture.policy.allowedIccSha256, [fixture.expectedStored.facts.iccSha256]);
    }
});
