import type { ImageParser } from './grammar-types.js';
import {
    ascii,
    Crc32,
    equalBytes,
    fail,
    iccRequiresNormalization,
    readU32Be,
    result,
    sha256,
    validateDimensions,
    validateIccProfile,
} from './grammar-utils.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function validateIhdr(payload: Uint8Array): {
    width: number;
    height: number;
    bitDepth: number;
    colorType: number;
} {
    if (payload.byteLength !== 13) fail('image_bad_length');
    const width = readU32Be(payload, 0);
    const height = readU32Be(payload, 4);
    const bitDepth = payload[8];
    const colorType = payload[9];
    const allowedDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
    };
    if (
        !allowedDepths[colorType]?.includes(bitDepth) ||
        payload[10] !== 0 ||
        payload[11] !== 0 ||
        ![0, 1].includes(payload[12])
    ) {
        fail('image_bad_length');
    }
    return { width, height, bitDepth, colorType };
}

function validateKeyword(payload: Uint8Array): number {
    const separator = payload.indexOf(0);
    if (separator < 1 || separator > 79) fail('image_bad_length');
    for (let index = 0; index < separator; index += 1) {
        const byte = payload[index];
        if (byte < 32 || (byte > 126 && byte < 161)) fail('image_bad_length');
    }
    return separator;
}

async function decompressBounded(
    compressed: Uint8Array,
    limit: number,
    invalidCode: 'image_bad_length' | 'image_invalid_icc',
): Promise<Uint8Array> {
    if (typeof DecompressionStream === 'undefined') fail(invalidCode);
    let stream: ReadableStream<Uint8Array>;
    try {
        stream = new Blob([compressed.slice()])
            .stream()
            .pipeThrough(new DecompressionStream('deflate'));
    } catch {
        fail(invalidCode);
    }

    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > limit) fail('image_metadata_budget_exceeded');
            parts.push(next.value);
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('image_')) throw error;
        fail(invalidCode);
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }

    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.byteLength;
    }
    return output;
}

export const parsePng: ImageParser = async (reader, policy, mode) => {
    const signature = await reader.readExact(8);
    if (!equalBytes(signature, PNG_SIGNATURE)) fail('image_unsupported_format');

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = -1;
    let chunkIndex = 0;
    let ihdrSeen = false;
    let plteSeen = false;
    let paletteEntries = 0;
    let idatSeen = false;
    let idatEnded = false;
    let iendSeen = false;
    let requiresNormalization = false;
    let metadataBytes = 0;
    let iccSha256: string | null = null;
    const singleton = new Set<string>();

    while (!iendSeen) {
        const length = readU32Be(await reader.readExact(4));
        if (!Number.isSafeInteger(length)) fail('image_bad_length');
        const typeBytes = await reader.readExact(4);
        const type = ascii(typeBytes);
        if (!/^[A-Za-z]{4}$/.test(type) || /[a-z]/.test(type[2])) {
            fail('image_unknown_record');
        }

        const crc = new Crc32();
        crc.update(typeBytes);
        const needsPayload = type !== 'IDAT';
        let payload: Uint8Array;
        if (needsPayload) {
            payload = await reader.readExact(length);
            crc.update(payload);
        } else {
            payload = new Uint8Array();
            await reader.skip(length, (chunk) => crc.update(chunk));
        }
        const expectedCrc = readU32Be(await reader.readExact(4));
        if (crc.digest() !== expectedCrc) fail('image_bad_crc');

        if (chunkIndex === 0 && type !== 'IHDR') fail('image_illegal_order');
        if (idatSeen && type !== 'IDAT' && type !== 'IEND') idatEnded = true;
        if (type === 'IDAT' && idatEnded) fail('image_illegal_order');

        if (type === 'IHDR') {
            if (ihdrSeen) fail('image_duplicate_record');
            const facts = validateIhdr(payload);
            width = facts.width;
            height = facts.height;
            bitDepth = facts.bitDepth;
            colorType = facts.colorType;
            validateDimensions(width, height, policy, mode);
            ihdrSeen = true;
            singleton.add(type);
        } else if (type === 'PLTE') {
            if (!ihdrSeen || idatSeen || plteSeen) {
                fail(plteSeen ? 'image_duplicate_record' : 'image_illegal_order');
            }
            if (
                colorType === 0 ||
                colorType === 4 ||
                payload.byteLength === 0 ||
                payload.byteLength % 3 !== 0 ||
                payload.byteLength > 768 ||
                (colorType === 3 && payload.byteLength / 3 > 2 ** bitDepth)
            ) {
                fail('image_bad_length');
            }
            plteSeen = true;
            paletteEntries = payload.byteLength / 3;
        } else if (type === 'IDAT') {
            if (!ihdrSeen || (colorType === 3 && !plteSeen)) {
                fail('image_illegal_order');
            }
            idatSeen = true;
        } else if (type === 'IEND') {
            if (!ihdrSeen || !idatSeen || length !== 0) fail('image_illegal_order');
            iendSeen = true;
        } else if (type === 'tRNS') {
            if (idatSeen || singleton.has(type)) {
                fail(singleton.has(type) ? 'image_duplicate_record' : 'image_illegal_order');
            }
            if (
                (colorType === 0 && length !== 2) ||
                (colorType === 2 && length !== 6) ||
                (colorType === 3 && (!plteSeen || length === 0 || length > paletteEntries)) ||
                colorType === 4 ||
                colorType === 6
            ) {
                fail('image_bad_length');
            }
            singleton.add(type);
        } else if (type === 'sBIT') {
            if (plteSeen || idatSeen || singleton.has(type)) {
                fail(singleton.has(type) ? 'image_duplicate_record' : 'image_illegal_order');
            }
            const expectedLength: Record<number, number> = {
                0: 1,
                2: 3,
                3: 3,
                4: 2,
                6: 4,
            };
            const maximum = colorType === 3 ? 8 : bitDepth;
            if (
                length !== expectedLength[colorType] ||
                payload.some((value) => value === 0 || value > maximum)
            ) {
                fail('image_bad_length');
            }
            singleton.add(type);
        } else if (type === 'bKGD') {
            if (idatSeen || singleton.has(type)) {
                fail(singleton.has(type) ? 'image_duplicate_record' : 'image_illegal_order');
            }
            const expectedLength = colorType === 3 ? 1 : colorType === 0 || colorType === 4 ? 2 : 6;
            if (
                length !== expectedLength ||
                (colorType === 3 && (!plteSeen || payload[0] >= paletteEntries))
            ) {
                fail('image_bad_length');
            }
            singleton.add(type);
        } else if (type === 'hIST') {
            if (idatSeen || singleton.has(type)) {
                fail(singleton.has(type) ? 'image_duplicate_record' : 'image_illegal_order');
            }
            if (colorType !== 3 || !plteSeen || length !== paletteEntries * 2) {
                fail('image_bad_length');
            }
            singleton.add(type);
        } else if (type === 'sRGB') {
            if (
                plteSeen ||
                idatSeen ||
                singleton.has(type) ||
                singleton.has('iCCP') ||
                length !== 1 ||
                payload[0] > 3
            ) {
                fail(
                    singleton.has(type)
                        ? 'image_duplicate_record'
                        : plteSeen || idatSeen || singleton.has('iCCP')
                          ? 'image_illegal_order'
                          : 'image_bad_length',
                );
            }
            singleton.add(type);
        } else if (type === 'gAMA') {
            if (
                plteSeen ||
                idatSeen ||
                singleton.has(type) ||
                length !== 4 ||
                readU32Be(payload) === 0
            ) {
                fail(
                    singleton.has(type)
                        ? 'image_duplicate_record'
                        : plteSeen || idatSeen
                          ? 'image_illegal_order'
                          : 'image_bad_length',
                );
            }
            singleton.add(type);
        } else if (type === 'cHRM') {
            if (plteSeen || idatSeen || singleton.has(type) || length !== 32) {
                fail(
                    singleton.has(type)
                        ? 'image_duplicate_record'
                        : plteSeen || idatSeen
                          ? 'image_illegal_order'
                          : 'image_bad_length',
                );
            }
            singleton.add(type);
        } else if (type === 'iCCP') {
            if (plteSeen || idatSeen || singleton.has(type) || singleton.has('sRGB')) {
                fail(singleton.has(type) ? 'image_duplicate_record' : 'image_illegal_order');
            }
            const separator = validateKeyword(payload);
            if (separator + 2 >= payload.byteLength || payload[separator + 1] !== 0) {
                fail('image_bad_length');
            }
            const profile = await decompressBounded(
                payload.subarray(separator + 2),
                policy.maxDecompressedIccBytes,
                'image_invalid_icc',
            );
            validateIccProfile(profile);
            iccSha256 = await sha256(profile);
            requiresNormalization =
                iccRequiresNormalization(mode, policy, iccSha256) || requiresNormalization;
            metadataBytes += payload.byteLength;
            singleton.add(type);
        } else if (
            type === 'eXIf' ||
            type === 'tEXt' ||
            type === 'zTXt' ||
            type === 'iTXt' ||
            type === 'tIME' ||
            type === 'pHYs'
        ) {
            if (singleton.has(type) && ['eXIf', 'tIME', 'pHYs'].includes(type)) {
                fail('image_duplicate_record');
            }
            if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
                const separator = validateKeyword(payload);
                if (type === 'zTXt') {
                    if (separator + 2 >= payload.byteLength || payload[separator + 1] !== 0) {
                        fail('image_bad_length');
                    }
                    await decompressBounded(
                        payload.subarray(separator + 2),
                        policy.preflightWorkingBytes,
                        'image_bad_length',
                    );
                }
                if (type === 'iTXt') {
                    let cursor = separator + 1;
                    if (
                        cursor + 2 > payload.byteLength ||
                        payload[cursor] > 1 ||
                        payload[cursor + 1] !== 0
                    ) {
                        fail('image_bad_length');
                    }
                    const compressed = payload[cursor] === 1;
                    cursor += 2;
                    const languageEnd = payload.indexOf(0, cursor);
                    if (languageEnd < cursor) fail('image_bad_length');
                    for (let index = cursor; index < languageEnd; index += 1) {
                        if (payload[index] < 0x20 || payload[index] > 0x7e) {
                            fail('image_bad_length');
                        }
                    }
                    cursor = languageEnd + 1;
                    const translatedEnd = payload.indexOf(0, cursor);
                    if (translatedEnd < cursor) fail('image_bad_length');
                    const utf8 = new TextDecoder('utf-8', { fatal: true });
                    try {
                        utf8.decode(payload.subarray(cursor, translatedEnd));
                        const text = compressed
                            ? await decompressBounded(
                                  payload.subarray(translatedEnd + 1),
                                  policy.preflightWorkingBytes,
                                  'image_bad_length',
                              )
                            : payload.subarray(translatedEnd + 1);
                        utf8.decode(text);
                    } catch (error) {
                        if (error instanceof Error && error.message.startsWith('image_')) {
                            throw error;
                        }
                        fail('image_bad_length');
                    }
                }
            }
            if (type === 'tIME') {
                if (
                    length !== 7 ||
                    readU32Be(Uint8Array.of(0, 0, payload[0], payload[1])) < 1995 ||
                    payload[2] < 1 ||
                    payload[2] > 12 ||
                    payload[3] < 1 ||
                    payload[3] > 31 ||
                    payload[4] > 23 ||
                    payload[5] > 59 ||
                    payload[6] > 60
                ) {
                    fail('image_bad_length');
                }
            }
            if (type === 'pHYs' && (length !== 9 || payload[8] > 1)) {
                fail('image_bad_length');
            }
            if (type === 'eXIf' && length === 0) fail('image_bad_length');
            metadataBytes += payload.byteLength;
            if (metadataBytes > policy.preflightWorkingBytes) {
                fail('image_metadata_budget_exceeded');
            }
            requiresNormalization = true;
            singleton.add(type);
        } else if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') {
            fail('image_animation_not_allowed');
        } else {
            fail('image_unknown_record');
        }

        chunkIndex += 1;
    }

    if (!(await reader.ensureEof())) fail('image_trailing_bytes');

    return result(
        mode,
        {
            mime: 'image/png',
            width,
            height,
            pagesOrFrames: 1,
            orientation: null,
            metadataBytes,
            iccSha256,
        },
        requiresNormalization,
    );
};
