import assert from 'node:assert/strict';
import test from 'node:test';
import {
    INITIAL_IMAGE_UPLOAD_POLICY,
    preflightImage,
    type ImageUploadPolicy,
} from '../src/index.ts';

function source(bytes: Uint8Array): AsyncIterable<Uint8Array> {
    return {
        async *[Symbol.asyncIterator]() {
            yield bytes;
        },
    };
}

function u16(value: number): number[] {
    return [(value >>> 8) & 0xff, value & 0xff];
}

function jpegHeader(width: number, height: number, metadataBytes = 0): Uint8Array {
    const metadata =
        metadataBytes === 0
            ? []
            : [0xff, 0xfe, ...u16(metadataBytes + 2), ...new Array(metadataBytes).fill(1)];
    return Uint8Array.of(
        0xff,
        0xd8,
        ...metadata,
        0xff,
        0xc0,
        0,
        11,
        8,
        ...u16(height),
        ...u16(width),
        1,
        1,
        0x11,
        0,
    );
}

function webpAnimatedHeader(): Uint8Array {
    return Uint8Array.of(
        0x52,
        0x49,
        0x46,
        0x46,
        14,
        0,
        0,
        0,
        0x57,
        0x45,
        0x42,
        0x50,
        0x56,
        0x50,
        0x38,
        0x58,
        10,
        0,
        0,
        0,
        0x02,
        0,
        0,
        0,
        0,
        0,
    );
}

test('preflight rejects invalid and over-policy source dimensions', async () => {
    for (const [bytes, code] of [
        [jpegHeader(0, 1), 'image_invalid_dimensions'],
        [jpegHeader(16_385, 1), 'image_source_dimension_exceeded'],
        [jpegHeader(10_000, 8_001), 'image_source_pixels_exceeded'],
    ] as const) {
        assert.deepEqual(await preflightImage(source(bytes), INITIAL_IMAGE_UPLOAD_POLICY), {
            outcome: 'rejected',
            code,
        });
    }
});

test('preflight rejects declared animation before decode', async () => {
    assert.deepEqual(
        await preflightImage(source(webpAnimatedHeader()), INITIAL_IMAGE_UPLOAD_POLICY),
        { outcome: 'rejected', code: 'image_animation_not_allowed' },
    );
});

test('preflight enforces the retained parser working-byte budget', async () => {
    const policy: ImageUploadPolicy = {
        ...INITIAL_IMAGE_UPLOAD_POLICY,
        preflightWorkingBytes: 32,
    };
    assert.deepEqual(await preflightImage(source(jpegHeader(1, 1, 33)), policy), {
        outcome: 'rejected',
        code: 'image_metadata_budget_exceeded',
    });
});
