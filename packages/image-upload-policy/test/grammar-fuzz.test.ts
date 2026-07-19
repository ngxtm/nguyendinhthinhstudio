import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStored } from '../src/index.ts';
import { IMAGE_GRAMMAR_FIXTURES, type ImageGrammarFixture } from '../src/fixtures.ts';

async function bytesOf(fixture: ImageGrammarFixture): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of fixture.input()) {
        chunks.push(chunk);
        length += chunk.byteLength;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function input(bytes: Uint8Array): AsyncIterable<Uint8Array> {
    return {
        async *[Symbol.asyncIterator]() {
            const middle = Math.floor(bytes.byteLength / 2);
            yield bytes.subarray(0, middle);
            yield bytes.subarray(middle);
        },
    };
}

function xorshift32(state: number): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
}

async function runSeed(seed: number) {
    const valid = IMAGE_GRAMMAR_FIXTURES.filter(
        (fixture) =>
            fixture.expectedStored.outcome === 'allowed' ||
            fixture.expectedStored.outcome === 'requiresNormalization',
    );
    const outcomes: string[] = [];
    let state = seed >>> 0;

    for (const fixture of valid) {
        const original = await bytesOf(fixture);
        const positions = new Set<number>([0, 1, original.byteLength - 1]);
        for (let index = 0; index < 24; index += 1) {
            state = xorshift32(state);
            positions.add(state % original.byteLength);
        }

        for (const position of positions) {
            const truncated = original.subarray(0, position);
            const result = await validateStored(input(truncated), fixture.policy);
            assert.equal(result.outcome, 'rejected', `${fixture.id}:${position}`);
            if (result.outcome === 'rejected') outcomes.push(result.code);
        }

        const trailing = new Uint8Array(original.byteLength + 1);
        trailing.set(original);
        trailing[trailing.byteLength - 1] = 0xa5;
        const trailingResult = await validateStored(input(trailing), fixture.policy);
        assert.equal(trailingResult.outcome, 'rejected', fixture.id);
        if (trailingResult.outcome === 'rejected') outcomes.push(trailingResult.code);
    }

    return { finalState: state, vectorCount: outcomes.length, outcomes };
}

test('seeded grammar mutations terminate with stable rejection categories', async () => {
    const first = await runSeed(0x4e445431);
    const second = await runSeed(0x4e445431);

    assert.ok(first.vectorCount >= 40);
    assert.deepEqual(second, first);
    assert.equal(
        first.outcomes.every((code) => code.startsWith('image_')),
        true,
    );
});

test('bad structural fixtures reject without uncaught RangeError', async () => {
    for (const fixture of IMAGE_GRAMMAR_FIXTURES.filter(
        (candidate) => candidate.expectedStored.outcome === 'rejected',
    )) {
        await assert.doesNotReject(async () => {
            const result = await validateStored(fixture.input(), fixture.policy);
            assert.equal(result.outcome, 'rejected');
        });
    }
});
