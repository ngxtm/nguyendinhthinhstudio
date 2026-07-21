import type { StoredImageErrorCode } from './error-codes.js';
import { BoundedImageReader, ImageGrammarError } from './grammar-reader.js';
import type { ImageByteReader, ImageInput, ImagePreflightResult } from './grammar-types.js';
import {
    ascii,
    equalBytes,
    fail,
    readU16Be,
    readU24Le,
    readU32Be,
    readU32Le,
    validateDimensions,
} from './grammar-utils.js';
import type { ImageUploadPolicy } from './policy.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function rejected(code: StoredImageErrorCode): ImagePreflightResult {
    return { outcome: 'rejected', code };
}

function accepted(
    mime: 'image/jpeg' | 'image/png' | 'image/webp',
    width: number,
    height: number,
    declaredAnimation = false,
    declaredPagesOrFrames: number | null = 1,
): ImagePreflightResult {
    return {
        outcome: 'accepted',
        facts: {
            mime,
            width,
            height,
            declaredAnimation,
            declaredPagesOrFrames,
        },
    };
}

async function jpegMarker(reader: ImageByteReader): Promise<number> {
    if ((await reader.readByte()) !== 0xff) fail('image_illegal_order');
    let marker: number | null;
    do {
        marker = await reader.readByte();
        if (marker === null) fail('image_truncated');
    } while (marker === 0xff);
    return marker;
}

async function preflightJpeg(
    reader: ImageByteReader,
    policy: ImageUploadPolicy,
): Promise<ImagePreflightResult> {
    const signature = await reader.readExact(2);
    if (signature[0] !== 0xff || signature[1] !== 0xd8) {
        fail('image_unsupported_format');
    }
    let metadataBytes = 0;

    for (;;) {
        const marker = await jpegMarker(reader);
        if (marker === 0xd9) fail('image_illegal_order');
        if (marker === 0xd8) fail('image_duplicate_record');
        const length = readU16Be(await reader.readExact(2));
        if (length < 2) fail('image_bad_length');
        const payloadLength = length - 2;

        if (marker === 0xc0 || marker === 0xc2) {
            if (payloadLength < 9) fail('image_bad_length');
            const payload = await reader.readExact(payloadLength);
            const height = readU16Be(payload, 1);
            const width = readU16Be(payload, 3);
            validateDimensions(width, height, policy, 'classify-source');
            return accepted('image/jpeg', width, height);
        }

        if (
            marker === 0xfe ||
            marker === 0xe1 ||
            marker === 0xe2 ||
            marker === 0xed ||
            marker === 0xe0
        ) {
            metadataBytes += payloadLength;
            if (metadataBytes > policy.preflightWorkingBytes) {
                fail('image_metadata_budget_exceeded');
            }
        }
        await reader.skip(payloadLength);
    }
}

async function preflightPng(
    reader: ImageByteReader,
    policy: ImageUploadPolicy,
): Promise<ImagePreflightResult> {
    if (!equalBytes(await reader.readExact(8), PNG_SIGNATURE)) {
        fail('image_unsupported_format');
    }
    let width = 0;
    let height = 0;
    let ihdrSeen = false;
    let metadataBytes = 0;

    for (;;) {
        const length = readU32Be(await reader.readExact(4));
        const type = ascii(await reader.readExact(4));
        if (type === 'IHDR') {
            if (ihdrSeen) fail('image_duplicate_record');
            if (length !== 13) fail('image_bad_length');
            const payload = await reader.readExact(13);
            width = readU32Be(payload, 0);
            height = readU32Be(payload, 4);
            validateDimensions(width, height, policy, 'classify-source');
            ihdrSeen = true;
        } else if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') {
            return rejected('image_animation_not_allowed');
        } else {
            if (!ihdrSeen) fail('image_illegal_order');
            if (
                type === 'eXIf' ||
                type === 'tEXt' ||
                type === 'zTXt' ||
                type === 'iTXt' ||
                type === 'iCCP'
            ) {
                metadataBytes += length;
                if (metadataBytes > policy.preflightWorkingBytes) {
                    fail('image_metadata_budget_exceeded');
                }
            }
            await reader.skip(length);
        }
        await reader.skip(4);
        if (type === 'IDAT' || type === 'IEND') {
            if (!ihdrSeen) fail('image_illegal_order');
            return accepted('image/png', width, height);
        }
    }
}

async function preflightWebp(
    reader: ImageByteReader,
    policy: ImageUploadPolicy,
): Promise<ImagePreflightResult> {
    const header = await reader.readExact(12);
    if (ascii(header.subarray(0, 4)) !== 'RIFF' || ascii(header.subarray(8, 12)) !== 'WEBP') {
        fail('image_unsupported_format');
    }
    const expectedEnd = 8 + readU32Le(header, 4);
    let canvasWidth = 0;
    let canvasHeight = 0;
    let extended = false;
    let metadataBytes = 0;

    while (reader.bytesRead < expectedEnd) {
        const chunk = await reader.readExact(8);
        const type = ascii(chunk.subarray(0, 4));
        const length = readU32Le(chunk, 4);
        if (type === 'VP8X') {
            if (extended || length !== 10) fail('image_bad_length');
            const first = await reader.readByte();
            if (first === null) fail('image_truncated');
            if ((first & 0x02) !== 0) return rejected('image_animation_not_allowed');
            const rest = await reader.readExact(9);
            canvasWidth = readU24Le(rest, 3) + 1;
            canvasHeight = readU24Le(rest, 6) + 1;
            validateDimensions(canvasWidth, canvasHeight, policy, 'classify-source');
            extended = true;
        } else if (type === 'VP8 ') {
            if (length < 10) fail('image_bad_length');
            const prefix = await reader.readExact(10);
            if (prefix[3] !== 0x9d || prefix[4] !== 0x01 || prefix[5] !== 0x2a) {
                fail('image_bad_length');
            }
            const width = (prefix[6] + prefix[7] * 0x100) & 0x3fff;
            const height = (prefix[8] + prefix[9] * 0x100) & 0x3fff;
            validateDimensions(width, height, policy, 'classify-source');
            return accepted(
                'image/webp',
                extended ? canvasWidth : width,
                extended ? canvasHeight : height,
            );
        } else if (type === 'VP8L') {
            if (length < 5) fail('image_bad_length');
            const prefix = await reader.readExact(5);
            if (prefix[0] !== 0x2f) fail('image_bad_length');
            const bits = readU32Le(prefix, 1);
            const width = (bits & 0x3fff) + 1;
            const height = ((bits >>> 14) & 0x3fff) + 1;
            validateDimensions(width, height, policy, 'classify-source');
            return accepted(
                'image/webp',
                extended ? canvasWidth : width,
                extended ? canvasHeight : height,
            );
        } else if (type === 'ANIM' || type === 'ANMF') {
            return rejected('image_animation_not_allowed');
        } else {
            if (type === 'ICCP' || type === 'EXIF' || type === 'XMP ') {
                metadataBytes += length;
                if (metadataBytes > policy.preflightWorkingBytes) {
                    fail('image_metadata_budget_exceeded');
                }
            }
            await reader.skip(length);
        }
        if ((length & 1) === 1) await reader.skip(1);
    }
    fail('image_truncated');
}

export async function preflightImage(
    input: ImageInput,
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
): Promise<ImagePreflightResult> {
    const reader = new BoundedImageReader(input, policy.preflightWorkingBytes, signal);
    try {
        const signature = await reader.readExact(12);
        reader.unread(signature);
        if (signature[0] === 0xff && signature[1] === 0xd8) {
            return await preflightJpeg(reader, policy);
        }
        if (equalBytes(signature.subarray(0, 8), PNG_SIGNATURE)) {
            return await preflightPng(reader, policy);
        }
        if (
            ascii(signature.subarray(0, 4)) === 'RIFF' &&
            ascii(signature.subarray(8, 12)) === 'WEBP'
        ) {
            return await preflightWebp(reader, policy);
        }
        return rejected('image_unsupported_format');
    } catch (error) {
        if (error instanceof ImageGrammarError) return rejected(error.code);
        throw error;
    } finally {
        await reader.close();
    }
}
