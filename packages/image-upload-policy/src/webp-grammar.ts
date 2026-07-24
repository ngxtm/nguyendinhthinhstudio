import type { ImageByteReader, ImageParser } from './grammar-types.js';
import {
    ascii,
    fail,
    iccRequiresNormalization,
    readU24Le,
    readU32Le,
    result,
    sha256,
    validateDimensions,
    validateIccProfile,
} from './grammar-utils.js';

async function readPayloadPrefix(
    reader: ImageByteReader,
    length: number,
    prefixLength: number,
): Promise<Uint8Array> {
    if (length < prefixLength) fail('image_bad_length');
    const prefix = await reader.readExact(prefixLength);
    await reader.skip(length - prefixLength);
    return prefix;
}

function parseVp8(payload: Uint8Array): { width: number; height: number } {
    if (
        payload.byteLength < 10 ||
        (payload[0] & 0x11) !== 0x10 ||
        ((payload[0] >>> 1) & 0x07) > 3 ||
        payload[3] !== 0x9d ||
        payload[4] !== 0x01 ||
        payload[5] !== 0x2a
    ) {
        fail('image_bad_length');
    }
    return {
        width: (payload[6] + payload[7] * 0x100) & 0x3fff,
        height: (payload[8] + payload[9] * 0x100) & 0x3fff,
    };
}

function parseVp8l(payload: Uint8Array): {
    width: number;
    height: number;
    alpha: boolean;
} {
    if (payload.byteLength < 5 || payload[0] !== 0x2f) {
        fail('image_bad_length');
    }
    const bits = readU32Le(payload, 1);
    if (bits >>> 29 !== 0) fail('image_bad_length');
    return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        alpha: ((bits >>> 28) & 1) === 1,
    };
}

async function consumePayload(
    reader: ImageByteReader,
    length: number,
    workingBytes: number,
): Promise<Uint8Array> {
    if (length > workingBytes) fail('image_metadata_budget_exceeded');
    return reader.readExact(length);
}

export const parseWebp: ImageParser = async (reader, policy, mode) => {
    const header = await reader.readExact(12);
    if (ascii(header.subarray(0, 4)) !== 'RIFF' || ascii(header.subarray(8, 12)) !== 'WEBP') {
        fail('image_unsupported_format');
    }

    const riffSize = readU32Le(header, 4);
    if (riffSize < 4) fail('image_bad_length');
    const expectedEnd = 8 + riffSize;
    let extended = false;
    let flags = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;
    let width = 0;
    let height = 0;
    let alphaUsed = false;
    let imageSeen = false;
    let alphaChunkSeen = false;
    let iccSeen = false;
    let exifSeen = false;
    let xmpSeen = false;
    let metadataBytes = 0;
    let iccSha256: string | null = null;
    let requiresNormalization = false;
    let chunkIndex = 0;

    while (reader.bytesRead < expectedEnd) {
        if (expectedEnd - reader.bytesRead < 8) fail('image_truncated');
        const chunkHeader = await reader.readExact(8);
        const type = ascii(chunkHeader.subarray(0, 4));
        const length = readU32Le(chunkHeader, 4);
        if (alphaChunkSeen && !imageSeen && type !== 'VP8 ') {
            fail('image_illegal_order');
        }
        const paddedLength = length + (length & 1);
        if (reader.bytesRead + paddedLength > expectedEnd) fail('image_bad_length');

        if (type === 'VP8X') {
            if (chunkIndex !== 0 || extended) fail('image_duplicate_record');
            if (length !== 10) fail('image_bad_length');
            const payload = await reader.readExact(10);
            flags = payload[0];
            if ((flags & ~0x3e) !== 0 || payload[1] !== 0 || payload[2] !== 0 || payload[3] !== 0) {
                fail('image_bad_length');
            }
            canvasWidth = readU24Le(payload, 4) + 1;
            canvasHeight = readU24Le(payload, 7) + 1;
            validateDimensions(canvasWidth, canvasHeight, policy, mode);
            extended = true;
        } else if (type === 'VP8 ') {
            if (imageSeen || (!extended && chunkIndex !== 0)) {
                fail('image_duplicate_record');
            }
            if (alphaChunkSeen && !extended) fail('image_illegal_order');
            const payload = await readPayloadPrefix(reader, length, 10);
            const dimensions = parseVp8(payload);
            width = dimensions.width;
            height = dimensions.height;
            validateDimensions(width, height, policy, mode);
            imageSeen = true;
        } else if (type === 'VP8L') {
            if (imageSeen || alphaChunkSeen || (!extended && chunkIndex !== 0)) {
                fail(imageSeen ? 'image_duplicate_record' : 'image_illegal_order');
            }
            const payload = await readPayloadPrefix(reader, length, 5);
            const dimensions = parseVp8l(payload);
            width = dimensions.width;
            height = dimensions.height;
            alphaUsed = dimensions.alpha;
            validateDimensions(width, height, policy, mode);
            imageSeen = true;
        } else if (type === 'ALPH') {
            if (!extended || alphaChunkSeen || imageSeen || length === 0) {
                fail(alphaChunkSeen ? 'image_duplicate_record' : 'image_illegal_order');
            }
            const header = await reader.readByte();
            if (
                header === null ||
                (header & 0x03) !== 0 ||
                ((header >>> 4) & 0x03) > 1 ||
                (header & 0xc0) !== 0
            ) {
                fail('image_bad_length');
            }
            await reader.skip(length - 1);
            alphaChunkSeen = true;
            alphaUsed = true;
        } else if (type === 'ICCP') {
            if (!extended || iccSeen || imageSeen) {
                fail(iccSeen ? 'image_duplicate_record' : 'image_illegal_order');
            }
            const profile = await consumePayload(
                reader,
                length,
                Math.min(policy.preflightWorkingBytes, policy.maxDecompressedIccBytes),
            );
            validateIccProfile(profile);
            iccSha256 = await sha256(profile);
            requiresNormalization =
                iccRequiresNormalization(mode, policy, iccSha256) || requiresNormalization;
            metadataBytes += length;
            iccSeen = true;
        } else if (type === 'EXIF' || type === 'XMP ') {
            if (!extended || !imageSeen) fail('image_illegal_order');
            const duplicate = type === 'EXIF' ? exifSeen : xmpSeen;
            if (duplicate) fail('image_duplicate_record');
            if (type === 'EXIF' && xmpSeen) fail('image_illegal_order');
            await consumePayload(reader, length, policy.preflightWorkingBytes);
            metadataBytes += length;
            if (metadataBytes > policy.preflightWorkingBytes) {
                fail('image_metadata_budget_exceeded');
            }
            requiresNormalization = true;
            if (type === 'EXIF') exifSeen = true;
            else xmpSeen = true;
        } else if (type === 'ANIM' || type === 'ANMF') {
            fail('image_animation_not_allowed');
        } else {
            fail('image_unknown_record');
        }

        if ((length & 1) === 1) {
            const padding = await reader.readByte();
            if (padding === null) fail('image_truncated');
            if (padding !== 0) fail('image_bad_padding');
        }
        chunkIndex += 1;
    }

    if (reader.bytesRead !== expectedEnd) fail('image_bad_length');
    if (!(await reader.ensureEof())) fail('image_trailing_bytes');
    if (!imageSeen) {
        if ((flags & 0x02) !== 0) fail('image_animation_not_allowed');
        fail('image_illegal_order');
    }

    if (extended) {
        if (width !== canvasWidth || height !== canvasHeight) {
            fail('image_invalid_dimensions');
        }
        if (((flags & 0x20) !== 0) !== iccSeen) fail('image_illegal_order');
        if (((flags & 0x10) !== 0) !== alphaUsed) fail('image_illegal_order');
        if (((flags & 0x08) !== 0) !== exifSeen) fail('image_illegal_order');
        if (((flags & 0x04) !== 0) !== xmpSeen) fail('image_illegal_order');
        if ((flags & 0x02) !== 0) fail('image_animation_not_allowed');
    } else if (chunkIndex !== 1) {
        fail('image_illegal_order');
    }

    return result(
        mode,
        {
            mime: 'image/webp',
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
