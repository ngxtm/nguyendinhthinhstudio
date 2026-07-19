import type { ImageGrammarResult, ImageInput } from './grammar-types.js';
import { INITIAL_IMAGE_UPLOAD_POLICY, type ImageUploadPolicy } from './policy.js';

export type ImageGrammarFixtureCategory =
    | 'orientation'
    | 'srgb'
    | 'wide-gamut'
    | 'intrinsic-alpha'
    | 'bad-length'
    | 'bad-crc'
    | 'bad-padding'
    | 'trailing-bytes'
    | 'unknown-metadata';

export type ImageCornerName = 'red' | 'green' | 'blue' | 'yellow';

export type ImageCornerSignature = {
    displayWidth: number;
    displayHeight: number;
    corners: readonly [ImageCornerName, ImageCornerName, ImageCornerName, ImageCornerName];
};

export type ImageGrammarFixture = {
    id: string;
    category: ImageGrammarFixtureCategory;
    orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
    cornerSignature?: ImageCornerSignature;
    policy: ImageUploadPolicy;
    input(): ImageInput;
    expectedClassify: ImageGrammarResult;
    expectedStored: ImageGrammarResult;
};

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

function u16le(value: number): Uint8Array {
    return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
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

function segment(marker: number, payload: Uint8Array): Uint8Array {
    return concat(Uint8Array.of(0xff, marker), u16be(payload.byteLength + 2), payload);
}

function minimalJpeg(metadata: readonly Uint8Array[] = []): Uint8Array {
    const dqt = segment(0xdb, concat(Uint8Array.of(0), new Uint8Array(64).fill(1)));
    const huffman = concat(
        Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        Uint8Array.of(0),
    );
    const dhtDc = segment(0xc4, concat(Uint8Array.of(0), huffman));
    const dhtAc = segment(0xc4, concat(Uint8Array.of(0x10), huffman));
    const sof = segment(0xc0, Uint8Array.of(8, 0, 1, 0, 1, 1, 1, 0x11, 0));
    const sos = segment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0));
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

function exifOrientation(orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): Uint8Array {
    return segment(
        0xe1,
        concat(
            new TextEncoder().encode('Exif\0\0II'),
            u16le(42),
            u32le(8),
            u16le(1),
            u16le(0x0112),
            u16le(3),
            u32le(1),
            u16le(orientation),
            u16le(0),
        ),
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

function minimalPng(extra: readonly Uint8Array[] = []): Uint8Array {
    return concat(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        pngChunk('IHDR', concat(u32be(1), u32be(1), Uint8Array.of(8, 6, 0, 0, 0))),
        ...extra,
        pngChunk('IDAT', Uint8Array.of(0x78, 0x01, 0)),
        pngChunk('IEND', new Uint8Array()),
    );
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
    return concat(
        new TextEncoder().encode(type),
        u32le(data.byteLength),
        data,
        data.byteLength % 2 === 1 ? Uint8Array.of(0) : new Uint8Array(),
    );
}

function minimalWebp(alpha = false): Uint8Array {
    const bits = alpha ? 1 << 28 : 0;
    const chunk = webpChunk('VP8L', concat(Uint8Array.of(0x2f), u32le(bits)));
    const body = concat(new TextEncoder().encode('WEBP'), chunk);
    return concat(new TextEncoder().encode('RIFF'), u32le(body.byteLength), body);
}

function adler32(bytes: Uint8Array): number {
    let a = 1;
    let b = 0;
    for (const byte of bytes) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

function zlibStored(bytes: Uint8Array): Uint8Array {
    const length = bytes.byteLength;
    return concat(
        Uint8Array.of(0x78, 0x01, 0x01),
        u16le(length),
        u16le(~length & 0xffff),
        bytes,
        u32be(adler32(bytes)),
    );
}

function wideGamutPng(): Uint8Array {
    const profile = new Uint8Array(132);
    profile.set(u32be(profile.byteLength), 0);
    profile.set(new TextEncoder().encode('acsp'), 36);
    profile.set(u32be(0), 128);
    const iccp = concat(new TextEncoder().encode('wide'), Uint8Array.of(0, 0), zlibStored(profile));
    return minimalPng([pngChunk('iCCP', iccp)]);
}

const CORNER_SIGNATURE_JPEG = Uint8Array.from(
    atob(
        '/9j/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAwAEADAREAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAoLCf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAXAQEBAQEAAAAAAAAAAAAAAAAACQsK/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A4vpTu/gAABSgluwrwAAE16pDdQAAAUoJbsK8AABNeqQ3UAAAFKCW7CvAAAQbtph1YAAANihgDqoAAAMddv8ACV4AADYoYA6qAAADHXb/AAleAAA2KGAOqgAAA//Z',
    ),
    (character) => character.charCodeAt(0),
);

function orientedCornerJpeg(orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): Uint8Array {
    return concat(
        CORNER_SIGNATURE_JPEG.subarray(0, 2),
        exifOrientation(orientation),
        CORNER_SIGNATURE_JPEG.subarray(2),
    );
}

const ORIENTATION_CORNER_SIGNATURES: Readonly<
    Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, ImageCornerSignature>
> = {
    1: { displayWidth: 64, displayHeight: 48, corners: ['red', 'green', 'blue', 'yellow'] },
    2: { displayWidth: 64, displayHeight: 48, corners: ['green', 'red', 'yellow', 'blue'] },
    3: { displayWidth: 64, displayHeight: 48, corners: ['yellow', 'blue', 'green', 'red'] },
    4: { displayWidth: 64, displayHeight: 48, corners: ['blue', 'yellow', 'red', 'green'] },
    5: { displayWidth: 48, displayHeight: 64, corners: ['red', 'blue', 'green', 'yellow'] },
    6: { displayWidth: 48, displayHeight: 64, corners: ['blue', 'red', 'yellow', 'green'] },
    7: { displayWidth: 48, displayHeight: 64, corners: ['yellow', 'green', 'blue', 'red'] },
    8: { displayWidth: 48, displayHeight: 64, corners: ['green', 'yellow', 'red', 'blue'] },
};

function asInput(bytes: Uint8Array): ImageInput {
    return {
        async *[Symbol.asyncIterator]() {
            yield bytes.slice();
        },
    };
}

function baseFacts(
    mime: 'image/jpeg' | 'image/png' | 'image/webp',
    overrides: Partial<{
        width: number;
        height: number;
        orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
        metadataBytes: number;
        iccSha256: string | null;
    }> = {},
) {
    return {
        mime,
        width: overrides.width ?? 1,
        height: overrides.height ?? 1,
        pagesOrFrames: 1 as const,
        orientation: overrides.orientation ?? null,
        metadataBytes: overrides.metadataBytes ?? 0,
        iccSha256: overrides.iccSha256 ?? null,
    };
}

function fixture(
    id: string,
    category: ImageGrammarFixtureCategory,
    bytes: Uint8Array,
    expectedClassify: ImageGrammarResult,
    expectedStored: ImageGrammarResult,
    orientation: ImageGrammarFixture['orientation'] = null,
    policy: ImageUploadPolicy = INITIAL_IMAGE_UPLOAD_POLICY,
    cornerSignature?: ImageCornerSignature,
): ImageGrammarFixture {
    return {
        id,
        category,
        orientation,
        ...(cornerSignature === undefined ? {} : { cornerSignature }),
        policy,
        input: () => asInput(bytes),
        expectedClassify,
        expectedStored,
    };
}

const orientationFixtures = ([1, 2, 3, 4, 5, 6, 7, 8] as const).map((orientation) => {
    const facts = baseFacts('image/jpeg', {
        width: 64,
        height: 48,
        orientation,
        metadataBytes: 28,
    });
    return fixture(
        `jpeg-orientation-${orientation}`,
        'orientation',
        orientedCornerJpeg(orientation),
        { outcome: 'requiresNormalization', facts },
        { outcome: 'rejected', code: 'image_metadata_not_allowed' },
        orientation,
        INITIAL_IMAGE_UPLOAD_POLICY,
        ORIENTATION_CORNER_SIGNATURES[orientation],
    );
});

const srgbFacts = baseFacts('image/png');
const alphaFacts = baseFacts('image/webp');
const WIDE_GAMUT_ICC_SHA256 = 'f1b507b1be52fe4859fed97898d58ca1c6f77c1cb818a299da572c3529ffc580';
const wideGamutFacts = baseFacts('image/png', {
    metadataBytes: 149,
    iccSha256: WIDE_GAMUT_ICC_SHA256,
});
const wideGamutPolicy: ImageUploadPolicy = {
    ...INITIAL_IMAGE_UPLOAD_POLICY,
    allowedIccSha256: [WIDE_GAMUT_ICC_SHA256],
};
const srgb = minimalPng([pngChunk('sRGB', Uint8Array.of(0))]);
const badCrc = minimalPng();
badCrc[29] ^= 1;
const badPadding = minimalWebp();
badPadding[badPadding.byteLength - 1] = 1;
const trailing = concat(minimalJpeg(), Uint8Array.of(0));
const unknown = minimalPng([pngChunk('vpAg', Uint8Array.of(1))]);

export const IMAGE_GRAMMAR_FIXTURES: readonly ImageGrammarFixture[] = Object.freeze([
    ...orientationFixtures,
    fixture(
        'png-srgb',
        'srgb',
        srgb,
        { outcome: 'allowed', facts: srgbFacts },
        { outcome: 'allowed', facts: srgbFacts },
    ),
    fixture(
        'png-wide-gamut-icc-allowed',
        'wide-gamut',
        wideGamutPng(),
        { outcome: 'allowed', facts: wideGamutFacts },
        { outcome: 'allowed', facts: wideGamutFacts },
        null,
        wideGamutPolicy,
    ),
    fixture(
        'png-wide-gamut-icc',
        'wide-gamut',
        wideGamutPng(),
        { outcome: 'rejected', code: 'image_invalid_icc' },
        { outcome: 'rejected', code: 'image_invalid_icc' },
    ),
    fixture(
        'webp-vp8l-intrinsic-alpha',
        'intrinsic-alpha',
        minimalWebp(true),
        { outcome: 'allowed', facts: alphaFacts },
        { outcome: 'allowed', facts: alphaFacts },
    ),
    fixture(
        'jpeg-bad-length',
        'bad-length',
        Uint8Array.of(0xff, 0xd8, 0xff, 0xfe, 0, 1, 0, 0, 0, 0, 0, 0),
        { outcome: 'rejected', code: 'image_bad_length' },
        { outcome: 'rejected', code: 'image_bad_length' },
    ),
    fixture(
        'png-bad-crc',
        'bad-crc',
        badCrc,
        { outcome: 'rejected', code: 'image_bad_crc' },
        { outcome: 'rejected', code: 'image_bad_crc' },
    ),
    fixture(
        'webp-bad-padding',
        'bad-padding',
        badPadding,
        { outcome: 'rejected', code: 'image_bad_padding' },
        { outcome: 'rejected', code: 'image_bad_padding' },
    ),
    fixture(
        'jpeg-trailing-byte',
        'trailing-bytes',
        trailing,
        { outcome: 'rejected', code: 'image_trailing_bytes' },
        { outcome: 'rejected', code: 'image_trailing_bytes' },
    ),
    fixture(
        'png-unknown-metadata',
        'unknown-metadata',
        unknown,
        { outcome: 'rejected', code: 'image_unknown_record' },
        { outcome: 'rejected', code: 'image_unknown_record' },
    ),
]);
