import type { ImageByteReader, ImageParser } from './grammar-types.js';
import {
    ascii,
    fail,
    readU16Be,
    result,
    sha256,
    validateDimensions,
    validateIccProfile,
} from './grammar-utils.js';

function parseExifOrientation(payload: Uint8Array): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null {
    if (payload.byteLength < 14 || ascii(payload.subarray(0, 6)) !== 'Exif\0\0') {
        return null;
    }
    const tiff = payload.subarray(6);
    const endian = ascii(tiff.subarray(0, 2));
    const little = endian === 'II';
    if (!little && endian !== 'MM') fail('image_bad_length');

    const u16 = (offset: number): number => {
        if (offset < 0 || offset + 2 > tiff.byteLength) fail('image_truncated');
        return little
            ? tiff[offset] + tiff[offset + 1] * 0x100
            : tiff[offset] * 0x100 + tiff[offset + 1];
    };
    const u32 = (offset: number): number => {
        if (offset < 0 || offset + 4 > tiff.byteLength) fail('image_truncated');
        return little
            ? tiff[offset] +
                  tiff[offset + 1] * 0x100 +
                  tiff[offset + 2] * 0x10000 +
                  tiff[offset + 3] * 0x1000000
            : tiff[offset] * 0x1000000 +
                  tiff[offset + 1] * 0x10000 +
                  tiff[offset + 2] * 0x100 +
                  tiff[offset + 3];
    };

    if (u16(2) !== 42) fail('image_bad_length');
    const ifdOffset = u32(4);
    const count = u16(ifdOffset);
    if (count > 4096) fail('image_metadata_budget_exceeded');
    for (let index = 0; index < count; index += 1) {
        const entry = ifdOffset + 2 + index * 12;
        if (entry + 12 > tiff.byteLength) fail('image_truncated');
        if (u16(entry) !== 0x0112) continue;
        if (u16(entry + 2) !== 3 || u32(entry + 4) !== 1) {
            fail('image_bad_length');
        }
        const orientation = u16(entry + 8);
        if (orientation < 1 || orientation > 8) fail('image_bad_length');
        return orientation as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    }
    return null;
}

function validateDqt(payload: Uint8Array, defined: Set<number>): void {
    let offset = 0;
    const seen = new Set<number>();
    while (offset < payload.byteLength) {
        const info = payload[offset++];
        const precision = info >>> 4;
        const table = info & 0x0f;
        if (precision > 1 || table > 3 || seen.has(table)) {
            fail('image_bad_length');
        }
        seen.add(table);
        defined.add(table);
        const length = precision === 0 ? 64 : 128;
        if (offset + length > payload.byteLength) fail('image_truncated');
        offset += length;
    }
    if (offset !== payload.byteLength || seen.size === 0) {
        fail('image_bad_length');
    }
}

function validateDht(payload: Uint8Array, definedDc: Set<number>, definedAc: Set<number>): void {
    let offset = 0;
    const seen = new Set<number>();
    while (offset < payload.byteLength) {
        const info = payload[offset++];
        const tableClass = info >>> 4;
        const table = info & 0x0f;
        if (tableClass > 1 || table > 3 || seen.has(info)) {
            fail('image_bad_length');
        }
        seen.add(info);
        (tableClass === 0 ? definedDc : definedAc).add(table);
        if (offset + 16 > payload.byteLength) fail('image_truncated');
        let symbols = 0;
        for (let index = 0; index < 16; index += 1) {
            symbols += payload[offset + index];
        }
        offset += 16;
        if (symbols === 0 || symbols > 256 || offset + symbols > payload.byteLength) {
            fail('image_bad_length');
        }
        offset += symbols;
    }
    if (offset !== payload.byteLength || seen.size === 0) {
        fail('image_bad_length');
    }
}

async function nextMarker(reader: ImageByteReader): Promise<number> {
    const prefix = await reader.readByte();
    if (prefix === null) fail('image_truncated');
    if (prefix !== 0xff) fail('image_illegal_order');

    let marker: number | null;
    do {
        marker = await reader.readByte();
        if (marker === null) fail('image_truncated');
    } while (marker === 0xff);
    if (marker === 0x00) fail('image_illegal_order');
    return marker;
}

async function segmentPayload(reader: ImageByteReader): Promise<Uint8Array> {
    const lengthBytes = await reader.readExact(2);
    const length = readU16Be(lengthBytes);
    if (length < 2) fail('image_bad_length');
    return reader.readExact(length - 2);
}

async function scanEntropy(reader: ImageByteReader, restartInterval: number): Promise<number> {
    let expectedRestart = 0;
    for (;;) {
        const byte = await reader.readByte();
        if (byte === null) fail('image_truncated');
        if (byte !== 0xff) continue;

        let marker: number | null;
        do {
            marker = await reader.readByte();
            if (marker === null) fail('image_truncated');
        } while (marker === 0xff);

        if (marker === 0x00) continue;
        if (marker >= 0xd0 && marker <= 0xd7) {
            if (restartInterval === 0 || marker !== 0xd0 + expectedRestart) {
                fail('image_illegal_order');
            }
            expectedRestart = (expectedRestart + 1) & 7;
            continue;
        }
        return marker;
    }
}

export const parseJpeg: ImageParser = async (reader, policy, mode) => {
    const soi = await reader.readExact(2);
    if (soi[0] !== 0xff || soi[1] !== 0xd8) fail('image_unsupported_format');

    let width = 0;
    let height = 0;
    let orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null = null;
    let metadataBytes = 0;
    let requiresNormalization = false;
    let frameSeen = false;
    let scanSeen = false;
    let dqtSeen = false;
    let dhtSeen = false;
    let jfifSeen = false;
    let adobeSeen = false;
    let pendingMarker: number | null = null;
    let frameMarker: 0xc0 | 0xc2 | null = null;
    let restartInterval = 0;
    const frameComponents = new Map<number, number>();
    const progressiveCoefficients = new Map<number, Int8Array>();
    const quantizationTables = new Set<number>();
    const dcTables = new Set<number>();
    const acTables = new Set<number>();
    const baselineScannedComponents = new Set<number>();
    let iccTotal: number | null = null;
    const iccParts = new Map<number, Uint8Array>();
    const addMetadata = (length: number): void => {
        metadataBytes += length;
        if (metadataBytes > policy.preflightWorkingBytes) {
            fail('image_metadata_budget_exceeded');
        }
    };

    for (;;) {
        const marker = pendingMarker ?? (await nextMarker(reader));
        pendingMarker = null;

        if (marker === 0xd9) {
            if (
                !frameSeen ||
                !scanSeen ||
                !dqtSeen ||
                !dhtSeen ||
                (frameMarker === 0xc0 && baselineScannedComponents.size !== frameComponents.size) ||
                (frameMarker === 0xc2 &&
                    Array.from(progressiveCoefficients.values()).some(
                        (coefficients) => coefficients[0] < 0,
                    ))
            ) {
                fail('image_illegal_order');
            }
            if (!(await reader.ensureEof())) fail('image_trailing_bytes');
            break;
        }
        if (marker === 0xd8) fail('image_duplicate_record');
        if (marker >= 0xd0 && marker <= 0xd7) fail('image_illegal_order');

        const payload = await segmentPayload(reader);

        if (marker === 0xdb) {
            validateDqt(payload, quantizationTables);
            dqtSeen = true;
            continue;
        }
        if (marker === 0xc4) {
            validateDht(payload, dcTables, acTables);
            dhtSeen = true;
            continue;
        }
        if (marker === 0xdd) {
            if (payload.byteLength !== 2) fail('image_bad_length');
            restartInterval = readU16Be(payload);
            continue;
        }
        if (marker === 0xc0 || marker === 0xc2) {
            if (frameSeen) fail('image_duplicate_record');
            if (payload.byteLength < 9 || payload[0] !== 8) fail('image_bad_length');
            height = readU16Be(payload, 1);
            width = readU16Be(payload, 3);
            const components = payload[5];
            if (![1, 3, 4].includes(components) || payload.byteLength !== 6 + components * 3) {
                fail('image_bad_length');
            }
            const ids = new Set<number>();
            for (let offset = 6; offset < payload.byteLength; offset += 3) {
                if (ids.has(payload[offset])) fail('image_duplicate_record');
                ids.add(payload[offset]);
                frameComponents.set(payload[offset], payload[offset + 2]);
                progressiveCoefficients.set(payload[offset], new Int8Array(64).fill(-1));
                const horizontal = payload[offset + 1] >>> 4;
                const vertical = payload[offset + 1] & 0x0f;
                if (horizontal < 1 || horizontal > 4 || vertical < 1 || vertical > 4) {
                    fail('image_bad_length');
                }
            }
            validateDimensions(width, height, policy, mode);
            frameMarker = marker;
            frameSeen = true;
            continue;
        }
        if (marker === 0xda) {
            if (!frameSeen || !dqtSeen || !dhtSeen || payload.byteLength < 6) {
                fail('image_illegal_order');
            }
            const components = payload[0];
            if (components < 1 || payload.byteLength !== 1 + components * 2 + 3) {
                fail('image_bad_length');
            }
            const scanComponents = new Set<number>();
            for (let offset = 1; offset < 1 + components * 2; offset += 2) {
                const component = payload[offset];
                const selectors = payload[offset + 1];
                const dcTable = selectors >>> 4;
                const acTable = selectors & 0x0f;
                const quantizationTable = frameComponents.get(component);
                if (
                    quantizationTable === undefined ||
                    scanComponents.has(component) ||
                    !quantizationTables.has(quantizationTable) ||
                    dcTable > 3 ||
                    acTable > 3
                ) {
                    fail('image_illegal_order');
                }
                scanComponents.add(component);
            }

            const spectralStart = payload[payload.byteLength - 3];
            const spectralEnd = payload[payload.byteLength - 2];
            const successiveHigh = payload[payload.byteLength - 1] >>> 4;
            const successiveLow = payload[payload.byteLength - 1] & 0x0f;
            if (frameMarker === 0xc0) {
                if (
                    spectralStart !== 0 ||
                    spectralEnd !== 63 ||
                    successiveHigh !== 0 ||
                    successiveLow !== 0
                ) {
                    fail('image_bad_length');
                }
                for (let offset = 1; offset < 1 + components * 2; offset += 2) {
                    const component = payload[offset];
                    const selectors = payload[offset + 1];
                    if (
                        baselineScannedComponents.has(component) ||
                        !dcTables.has(selectors >>> 4) ||
                        !acTables.has(selectors & 0x0f)
                    ) {
                        fail('image_illegal_order');
                    }
                    baselineScannedComponents.add(component);
                }
            } else {
                if (
                    spectralStart > spectralEnd ||
                    spectralEnd > 63 ||
                    successiveHigh > 13 ||
                    successiveLow > 13 ||
                    (spectralStart === 0 && spectralEnd !== 0) ||
                    (spectralStart > 0 && components !== 1) ||
                    (successiveHigh !== 0 && successiveHigh !== successiveLow + 1)
                ) {
                    fail('image_bad_length');
                }
                for (let offset = 1; offset < 1 + components * 2; offset += 2) {
                    const component = payload[offset];
                    const selectors = payload[offset + 1];
                    if (
                        (spectralStart === 0 && !dcTables.has(selectors >>> 4)) ||
                        (spectralEnd > 0 && !acTables.has(selectors & 0x0f))
                    ) {
                        fail('image_illegal_order');
                    }
                    const coefficients = progressiveCoefficients.get(component);
                    if (!coefficients) fail('image_illegal_order');
                    for (
                        let coefficient = spectralStart;
                        coefficient <= spectralEnd;
                        coefficient += 1
                    ) {
                        if (
                            (successiveHigh === 0 && coefficients[coefficient] !== -1) ||
                            (successiveHigh !== 0 && coefficients[coefficient] !== successiveHigh)
                        ) {
                            fail('image_illegal_order');
                        }
                        coefficients[coefficient] = successiveLow;
                    }
                }
            }
            scanSeen = true;
            pendingMarker = await scanEntropy(reader, restartInterval);
            continue;
        }

        if (marker === 0xe0) {
            if (payload.byteLength >= 5 && ascii(payload.subarray(0, 5)) === 'JFIF\0') {
                if (jfifSeen) fail('image_duplicate_record');
                if (
                    payload.byteLength < 14 ||
                    payload[5] !== 1 ||
                    payload[6] > 2 ||
                    payload[7] > 2 ||
                    readU16Be(payload, 8) === 0 ||
                    readU16Be(payload, 10) === 0
                ) {
                    fail('image_bad_length');
                }
                const expected = 14 + payload[12] * payload[13] * 3;
                if (payload.byteLength !== expected) fail('image_bad_length');
                jfifSeen = true;
                continue;
            }
            if (payload.byteLength >= 5 && ascii(payload.subarray(0, 5)) === 'JFXX\0') {
                if (!jfifSeen || payload.byteLength < 6) fail('image_illegal_order');
                const extension = payload[5];
                if (extension === 0x10) {
                    if (
                        payload.byteLength < 10 ||
                        payload[6] !== 0xff ||
                        payload[7] !== 0xd8 ||
                        payload[payload.byteLength - 2] !== 0xff ||
                        payload[payload.byteLength - 1] !== 0xd9
                    ) {
                        fail('image_bad_length');
                    }
                } else if (extension === 0x11 || extension === 0x13) {
                    if (payload.byteLength < 8) fail('image_bad_length');
                    const pixels = payload[6] * payload[7];
                    const expected = extension === 0x11 ? 8 + 768 + pixels : 8 + pixels * 3;
                    if (payload.byteLength !== expected) fail('image_bad_length');
                } else {
                    fail('image_unknown_record');
                }
                addMetadata(payload.byteLength);
                requiresNormalization = true;
                continue;
            }
            fail('image_unknown_record');
        }
        if (marker === 0xee) {
            if (adobeSeen) fail('image_duplicate_record');
            if (
                payload.byteLength !== 12 ||
                ascii(payload.subarray(0, 5)) !== 'Adobe' ||
                readU16Be(payload, 5) === 0 ||
                payload[11] > 2
            ) {
                fail('image_bad_length');
            }
            adobeSeen = true;
            continue;
        }
        if (marker === 0xe2) {
            if (payload.byteLength < 14 || ascii(payload.subarray(0, 12)) !== 'ICC_PROFILE\0') {
                fail('image_unknown_record');
            }
            const sequence = payload[12];
            const total = payload[13];
            if (sequence < 1 || total < 1 || sequence > total) fail('image_bad_length');
            if (iccTotal !== null && iccTotal !== total) fail('image_bad_length');
            if (iccParts.has(sequence)) fail('image_duplicate_record');
            if (iccParts.size > 0 && sequence !== iccParts.size + 1) {
                fail('image_illegal_order');
            }
            iccTotal = total;
            addMetadata(payload.byteLength);
            iccParts.set(sequence, payload.subarray(14));
            continue;
        }
        if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
            if (marker === 0xe1) {
                const isExif =
                    payload.byteLength >= 6 && ascii(payload.subarray(0, 6)) === 'Exif\0\0';
                const isXmp =
                    payload.byteLength > 29 &&
                    ascii(payload.subarray(0, 29)) === 'http://ns.adobe.com/xap/1.0/\0';
                if (!isExif && !isXmp) fail('image_unknown_record');
                if (isExif) {
                    orientation = parseExifOrientation(payload) ?? orientation;
                }
            }
            addMetadata(payload.byteLength);
            requiresNormalization = true;
            continue;
        }
        if (marker >= 0xe0 && marker <= 0xef) fail('image_unknown_record');
        fail('image_unknown_record');
    }

    let iccSha256: string | null = null;
    if (iccTotal !== null) {
        if (iccParts.size !== iccTotal) fail('image_truncated');
        const length = Array.from(iccParts.values()).reduce(
            (sum, part) => sum + part.byteLength,
            0,
        );
        if (length > policy.maxDecompressedIccBytes) {
            fail('image_metadata_budget_exceeded');
        }
        const profile = new Uint8Array(length);
        let offset = 0;
        for (let index = 1; index <= iccTotal; index += 1) {
            const part = iccParts.get(index);
            if (!part) fail('image_truncated');
            profile.set(part, offset);
            offset += part.byteLength;
        }
        validateIccProfile(profile);
        iccSha256 = await sha256(profile);
        if (!policy.allowedIccSha256.includes(iccSha256)) {
            fail('image_invalid_icc');
        }
    }

    return result(
        mode,
        {
            mime: 'image/jpeg',
            width,
            height,
            pagesOrFrames: 1,
            orientation,
            metadataBytes,
            iccSha256,
        },
        requiresNormalization,
    );
};
