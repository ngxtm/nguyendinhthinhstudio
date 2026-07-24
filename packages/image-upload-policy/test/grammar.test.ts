import assert from 'node:assert/strict';
import test from 'node:test';
import {
    INITIAL_IMAGE_UPLOAD_POLICY,
    classifySource,
    validateStored,
    type ImageGrammarResult,
    type StoredImageErrorCode,
} from '../src/index.ts';

function input(chunks: readonly Uint8Array[], onClose?: () => void): AsyncIterable<Uint8Array> {
    return {
        [Symbol.asyncIterator]() {
            let index = 0;
            return {
                async next() {
                    if (index >= chunks.length) return { done: true, value: undefined };
                    return { done: false, value: chunks[index++] };
                },
                async return() {
                    onClose?.();
                    return { done: true, value: undefined };
                },
            };
        },
    };
}

function exhaust(result: ImageGrammarResult): string {
    switch (result.outcome) {
        case 'allowed':
        case 'requiresNormalization':
            return result.facts.mime;
        case 'rejected':
            return result.code;
    }
}

test('exports closed grammar result discriminants and stable rejection codes', async () => {
    const result = await validateStored(
        input([new TextEncoder().encode('not an image')]),
        INITIAL_IMAGE_UPLOAD_POLICY,
    );
    assert.deepEqual(result, {
        outcome: 'rejected',
        code: 'image_unsupported_format',
    });
    assert.equal(exhaust(result), 'image_unsupported_format');

    const code: StoredImageErrorCode = result.code;
    assert.equal(code, 'image_unsupported_format');
});

test('reports truncation without leaking the input iterator', async () => {
    let closed = false;
    const result = await classifySource(
        input([Uint8Array.of(0xff, 0xd8)], () => {
            closed = true;
        }),
        INITIAL_IMAGE_UPLOAD_POLICY,
    );

    assert.deepEqual(result, { outcome: 'rejected', code: 'image_truncated' });
    assert.equal(closed, true);
});

test('aborts promptly and closes the input iterator', async () => {
    let closed = false;
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        validateStored(
            input([new Uint8Array(32)], () => {
                closed = true;
            }),
            INITIAL_IMAGE_UPLOAD_POLICY,
            controller.signal,
        ),
        { name: 'AbortError' },
    );
    assert.equal(closed, true);
});

function concat(...parts: readonly Uint8Array[]): Uint8Array {
    const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.byteLength;
    }
    return output;
}

function u16be(value: number): Uint8Array {
    return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

function u32be(value: number): Uint8Array {
    return Uint8Array.of(
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    );
}

function u32le(value: number): Uint8Array {
    return Uint8Array.of(
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
    );
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    return concat(u32be(data.byteLength), typeBytes, data, u32be(crc32(concat(typeBytes, data))));
}

function png(...extra: readonly Uint8Array[]): Uint8Array {
    const ihdr = concat(u32be(1), u32be(1), Uint8Array.of(8, 6, 0, 0, 0));
    return concat(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        pngChunk('IHDR', ihdr),
        ...extra,
        pngChunk('IDAT', Uint8Array.of(0x78, 0x01, 0x00)),
        pngChunk('IEND', new Uint8Array()),
    );
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
    return concat(Uint8Array.of(0xff, marker), u16be(payload.byteLength + 2), payload);
}

function jpeg(...metadata: readonly Uint8Array[]): Uint8Array {
    const dqt = jpegSegment(0xdb, concat(Uint8Array.of(0), new Uint8Array(64).fill(1)));
    const dhtPayload = concat(
        Uint8Array.of(0),
        Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        Uint8Array.of(0),
    );
    const dhtDc = jpegSegment(0xc4, dhtPayload);
    const dhtAc = jpegSegment(0xc4, concat(Uint8Array.of(0x10), dhtPayload.subarray(1)));
    const sof = jpegSegment(0xc0, Uint8Array.of(8, 0, 1, 0, 1, 1, 1, 0x11, 0));
    const sos = jpegSegment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0));
    return concat(
        Uint8Array.of(0xff, 0xd8),
        ...metadata,
        dqt,
        dhtDc,
        dhtAc,
        sof,
        sos,
        Uint8Array.of(0),
        Uint8Array.of(0xff, 0xd9),
    );
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
    const pad = data.byteLength % 2 === 1 ? Uint8Array.of(0) : new Uint8Array();
    return concat(new TextEncoder().encode(type), u32le(data.byteLength), data, pad);
}

function webp(...chunks: readonly Uint8Array[]): Uint8Array {
    const body = concat(new TextEncoder().encode('WEBP'), ...chunks);
    return concat(new TextEncoder().encode('RIFF'), u32le(body.byteLength), body);
}

const vp8l = webpChunk('VP8L', Uint8Array.of(0x2f, 0, 0, 0, 0));

test('accepts complete canonical JPEG, PNG, and WebP structures', async () => {
    for (const [mime, bytes] of [
        ['image/jpeg', jpeg()],
        ['image/png', png()],
        ['image/webp', webp(vp8l)],
    ] as const) {
        const result = await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY);
        assert.equal(result.outcome, 'allowed', mime);
        if (result.outcome === 'allowed') {
            assert.equal(result.facts.mime, mime);
            assert.equal(result.facts.width, 1);
            assert.equal(result.facts.height, 1);
            assert.equal(result.facts.pagesOrFrames, 1);
        }
    }
});

test('classifies recognized source-only metadata and rejects it for storage', async () => {
    const vectors = [
        ['jpeg', jpeg(jpegSegment(0xfe, new TextEncoder().encode('comment')))],
        ['png', png(pngChunk('tEXt', Uint8Array.of(107, 101, 121, 0, 118, 97, 108, 117, 101)))],
        [
            'webp',
            webp(
                webpChunk('VP8X', Uint8Array.of(0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
                vp8l,
                webpChunk('EXIF', Uint8Array.of(1, 2, 3, 4)),
            ),
        ],
    ] as const;

    for (const [label, bytes] of vectors) {
        const source = await classifySource(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY);
        assert.equal(source.outcome, 'requiresNormalization', label);

        const stored = await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY);
        assert.deepEqual(stored, {
            outcome: 'rejected',
            code: 'image_metadata_not_allowed',
        });
    }
});

test('rejects CRC, padding, animation, duplicate, and terminal-byte violations', async () => {
    const badCrc = png();
    badCrc[29] ^= 1;
    const badPadding = webp(vp8l);
    badPadding[badPadding.length - 1] = 1;
    const animatedWebp = webp(
        webpChunk('VP8X', Uint8Array.of(0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
        webpChunk('ANIM', new Uint8Array(6)),
    );
    const duplicatePng = concat(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        pngChunk('IHDR', concat(u32be(1), u32be(1), Uint8Array.of(8, 6, 0, 0, 0))),
        pngChunk('IHDR', concat(u32be(1), u32be(1), Uint8Array.of(8, 6, 0, 0, 0))),
        pngChunk('IEND', new Uint8Array()),
    );

    const vectors = [
        [badCrc, 'image_bad_crc'],
        [badPadding, 'image_bad_padding'],
        [animatedWebp, 'image_animation_not_allowed'],
        [duplicatePng, 'image_duplicate_record'],
        [concat(jpeg(), Uint8Array.of(0)), 'image_trailing_bytes'],
        [concat(png(), Uint8Array.of(0)), 'image_trailing_bytes'],
        [concat(webp(vp8l), Uint8Array.of(0)), 'image_trailing_bytes'],
    ] as const;

    for (const [bytes, code] of vectors) {
        const result = await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY);
        assert.deepEqual(result, { outcome: 'rejected', code });
    }
});

function markerOffset(bytes: Uint8Array, marker: number): number {
    for (let index = 0; index + 1 < bytes.byteLength; index += 1) {
        if (bytes[index] === 0xff && bytes[index + 1] === marker) return index;
    }
    throw new Error(`missing JPEG marker 0x${marker.toString(16)}`);
}

test('rejects JPEG scans that reference undeclared components or tables', async () => {
    const unknownComponent = jpeg();
    const sos = markerOffset(unknownComponent, 0xda);
    unknownComponent[sos + 5] = 2;

    const unknownQuantizationTable = jpeg();
    const sof = markerOffset(unknownQuantizationTable, 0xc0);
    unknownQuantizationTable[sof + 12] = 1;

    for (const bytes of [unknownComponent, unknownQuantizationTable]) {
        assert.deepEqual(await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
            outcome: 'rejected',
            code: 'image_illegal_order',
        });
    }
});

test('rejects JPEG restart markers without a non-zero restart interval', async () => {
    const original = jpeg();
    const eoi = markerOffset(original, 0xd9);
    const bytes = concat(
        original.subarray(0, eoi),
        Uint8Array.of(0xff, 0xd0),
        original.subarray(eoi),
    );

    assert.deepEqual(await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
        outcome: 'rejected',
        code: 'image_illegal_order',
    });
});

test('accepts legal bounded PNG structural chunks and zero-length IDAT', async () => {
    const bytes = png(
        pngChunk('sBIT', Uint8Array.of(8, 8, 8, 8)),
        pngChunk('bKGD', Uint8Array.of(0, 0, 0, 0, 0, 0)),
        pngChunk('IDAT', new Uint8Array()),
    );

    const result = await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY);
    assert.equal(result.outcome, 'allowed');
});

test('validates indexed PNG transparency against the declared palette', async () => {
    const ihdr = concat(u32be(1), u32be(1), Uint8Array.of(1, 3, 0, 0, 0));
    const bytes = concat(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        pngChunk('IHDR', ihdr),
        pngChunk('PLTE', Uint8Array.of(0, 0, 0, 255, 255, 255)),
        pngChunk('tRNS', Uint8Array.of(0, 0, 0)),
        pngChunk('IDAT', Uint8Array.of(0x78, 0x01, 0)),
        pngChunk('IEND', new Uint8Array()),
    );

    assert.deepEqual(await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
        outcome: 'rejected',
        code: 'image_bad_length',
    });
});

test('validates compressed PNG text headers before classifying metadata', async () => {
    const invalidCompressionMethod = pngChunk(
        'zTXt',
        Uint8Array.of(107, 101, 121, 0, 1, 0x78, 0x01),
    );

    assert.deepEqual(
        await classifySource(input([png(invalidCompressionMethod)]), INITIAL_IMAGE_UPLOAD_POLICY),
        { outcome: 'rejected', code: 'image_bad_length' },
    );
});

test('requires canonical WebP EXIF-before-XMP metadata order', async () => {
    const bytes = webp(
        webpChunk('VP8X', Uint8Array.of(0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
        vp8l,
        webpChunk('XMP ', Uint8Array.of(1, 2)),
        webpChunk('EXIF', Uint8Array.of(3, 4)),
    );

    assert.deepEqual(await classifySource(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
        outcome: 'rejected',
        code: 'image_illegal_order',
    });
});

function iccProfile(size = 132, declaredSize = size): Uint8Array {
    const profile = new Uint8Array(size);
    profile.set(u32be(declaredSize), 0);
    profile.set(new TextEncoder().encode('acsp'), 36);
    if (size >= 132) profile.set(u32be(0), 128);
    return profile;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
        '',
    );
}

test('enforces the cumulative JPEG ICC metadata budget before assembly', async () => {
    const first = concat(
        new TextEncoder().encode('ICC_PROFILE\0'),
        Uint8Array.of(1, 2),
        new Uint8Array(80),
    );
    const second = concat(
        new TextEncoder().encode('ICC_PROFILE\0'),
        Uint8Array.of(2, 2),
        new Uint8Array(80),
    );
    const policy = {
        ...INITIAL_IMAGE_UPLOAD_POLICY,
        preflightWorkingBytes: 128,
    };

    assert.deepEqual(
        await classifySource(
            input([jpeg(jpegSegment(0xe2, first), jpegSegment(0xe2, second))]),
            policy,
        ),
        { outcome: 'rejected', code: 'image_metadata_budget_exceeded' },
    );
});

test('rejects ICC profiles whose declared structure does not match the payload', async () => {
    const malformed = iccProfile(132, 128);
    const digest = await sha256Hex(malformed);
    const policy = {
        ...INITIAL_IMAGE_UPLOAD_POLICY,
        allowedIccSha256: [digest],
    };
    const bytes = webp(
        webpChunk('VP8X', Uint8Array.of(0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
        webpChunk('ICCP', malformed),
        vp8l,
    );

    assert.deepEqual(await classifySource(input([bytes]), policy), {
        outcome: 'rejected',
        code: 'image_invalid_icc',
    });
    assert.deepEqual(await validateStored(input([bytes]), policy), {
        outcome: 'rejected',
        code: 'image_invalid_icc',
    });
});

test('requires PNG color chunks before PLTE and image data', async () => {
    const ihdr = concat(u32be(1), u32be(1), Uint8Array.of(1, 3, 0, 0, 0));
    const bytes = concat(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        pngChunk('IHDR', ihdr),
        pngChunk('PLTE', Uint8Array.of(0, 0, 0, 255, 255, 255)),
        pngChunk('sRGB', Uint8Array.of(0)),
        pngChunk('IDAT', Uint8Array.of(0x78, 0x01, 0)),
        pngChunk('IEND', new Uint8Array()),
    );

    assert.deepEqual(await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
        outcome: 'rejected',
        code: 'image_illegal_order',
    });
});

test('rejects non-key VP8 frames and invalid ALPH headers', async () => {
    const nonKeyVp8 = webp(
        webpChunk('VP8 ', Uint8Array.of(0x11, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0)),
    );
    const vp8 = webpChunk('VP8 ', Uint8Array.of(0x10, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0));
    const badAlpha = webp(
        webpChunk('VP8X', Uint8Array.of(0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
        webpChunk('ALPH', Uint8Array.of(0xc0)),
        vp8,
    );

    for (const bytes of [nonKeyVp8, badAlpha]) {
        assert.deepEqual(await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
            outcome: 'rejected',
            code: 'image_bad_length',
        });
    }
});

test('validates JPEG APP0, APP1, and APP14 record payloads', async () => {
    const invalidJfif = jpeg(
        jpegSegment(0xe0, Uint8Array.of(0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3, 0, 1, 0, 1, 0, 0)),
    );
    const jfxxWithoutJfif = jpeg(
        jpegSegment(0xe0, Uint8Array.of(0x4a, 0x46, 0x58, 0x58, 0, 0x13, 1, 1, 0, 0, 0)),
    );
    const unknownApp1 = jpeg(jpegSegment(0xe1, Uint8Array.of(1, 2, 3, 4)));
    const invalidAdobe = jpeg(
        jpegSegment(0xee, Uint8Array.of(0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 3)),
    );

    for (const [bytes, code] of [
        [invalidJfif, 'image_bad_length'],
        [jfxxWithoutJfif, 'image_illegal_order'],
        [unknownApp1, 'image_unknown_record'],
        [invalidAdobe, 'image_bad_length'],
    ] as const) {
        assert.deepEqual(await classifySource(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
            outcome: 'rejected',
            code,
        });
    }
});

test('rejects malformed compressed PNG text and iTXt envelopes', async () => {
    const malformedCompressed = pngChunk('zTXt', Uint8Array.of(107, 101, 121, 0, 0, 1, 2, 3));
    const malformedInternational = pngChunk('iTXt', Uint8Array.of(107, 101, 121, 0, 2, 0, 0, 0));

    for (const chunk of [malformedCompressed, malformedInternational]) {
        assert.deepEqual(await classifySource(input([png(chunk)]), INITIAL_IMAGE_UPLOAD_POLICY), {
            outcome: 'rejected',
            code: 'image_bad_length',
        });
    }
});

test('accepts legal progressive JPEG scans and ordered restart markers', async () => {
    const progressive = jpeg();
    const sof = markerOffset(progressive, 0xc0);
    progressive[sof + 1] = 0xc2;
    const sos = markerOffset(progressive, 0xda);
    progressive[sos + 8] = 0;
    const eoi = markerOffset(progressive, 0xd9);
    const progressiveScans = concat(
        progressive.subarray(0, eoi),
        jpegSegment(0xda, Uint8Array.of(1, 1, 0, 1, 63, 0)),
        Uint8Array.of(0),
        progressive.subarray(eoi),
    );

    const baseline = jpeg();
    const baselineSos = markerOffset(baseline, 0xda);
    const baselineEoi = markerOffset(baseline, 0xd9);
    const withRestart = concat(
        baseline.subarray(0, baselineSos),
        jpegSegment(0xdd, Uint8Array.of(0, 1)),
        baseline.subarray(baselineSos, baselineEoi),
        Uint8Array.of(0xff, 0xd0),
        baseline.subarray(baselineEoi),
    );

    for (const bytes of [progressiveScans, withRestart]) {
        const result = await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY);
        assert.equal(result.outcome, 'allowed');
    }
});

test('accepts canonical simple VP8 and extended ALPH plus VP8 structures', async () => {
    const vp8 = webpChunk('VP8 ', Uint8Array.of(0x10, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0));
    const vectors = [
        webp(vp8),
        webp(
            webpChunk('VP8X', Uint8Array.of(0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
            webpChunk('ALPH', Uint8Array.of(0)),
            vp8,
        ),
    ];

    for (const bytes of vectors) {
        const result = await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY);
        assert.equal(result.outcome, 'allowed');
    }
});

test('aborts a stalled async input read and releases the iterator', async () => {
    let closed = false;
    const stalled: AsyncIterable<Uint8Array> = {
        [Symbol.asyncIterator]() {
            return {
                next: () => new Promise<IteratorResult<Uint8Array>>(() => undefined),
                async return() {
                    closed = true;
                    return { done: true, value: undefined };
                },
            };
        },
    };
    const controller = new AbortController();
    const parsing = classifySource(stalled, INITIAL_IMAGE_UPLOAD_POLICY, controller.signal);
    queueMicrotask(() => controller.abort());

    await assert.rejects(parsing, { name: 'AbortError' });
    assert.equal(closed, true);
});

test('rejects progressive refinement scans without an initial coefficient scan', async () => {
    const bytes = jpeg();
    const sof = markerOffset(bytes, 0xc0);
    bytes[sof + 1] = 0xc2;
    const sos = markerOffset(bytes, 0xda);
    bytes[sos + 8] = 0;
    bytes[sos + 9] = 0x10;

    assert.deepEqual(await validateStored(input([bytes]), INITIAL_IMAGE_UPLOAD_POLICY), {
        outcome: 'rejected',
        code: 'image_illegal_order',
    });
});
