import type { StoredImageErrorCode } from './error-codes.js';
import { ImageGrammarError } from './grammar-reader.js';
import type { ImageFacts, ImageGrammarMode, ImageGrammarResult } from './grammar-types.js';
import type { ImageUploadPolicy } from './policy.js';

export function fail(code: StoredImageErrorCode): never {
    throw new ImageGrammarError(code);
}

export function readU16Be(bytes: Uint8Array, offset = 0): number {
    if (offset < 0 || offset + 2 > bytes.byteLength) fail('image_truncated');
    return bytes[offset] * 0x100 + bytes[offset + 1];
}

export function readU24Le(bytes: Uint8Array, offset = 0): number {
    if (offset < 0 || offset + 3 > bytes.byteLength) fail('image_truncated');
    return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000;
}

export function readU32Be(bytes: Uint8Array, offset = 0): number {
    if (offset < 0 || offset + 4 > bytes.byteLength) fail('image_truncated');
    return (
        bytes[offset] * 0x1000000 +
        bytes[offset + 1] * 0x10000 +
        bytes[offset + 2] * 0x100 +
        bytes[offset + 3]
    );
}

export function readU32Le(bytes: Uint8Array, offset = 0): number {
    if (offset < 0 || offset + 4 > bytes.byteLength) fail('image_truncated');
    return (
        bytes[offset] +
        bytes[offset + 1] * 0x100 +
        bytes[offset + 2] * 0x10000 +
        bytes[offset + 3] * 0x1000000
    );
}

export function ascii(bytes: Uint8Array): string {
    return String.fromCharCode(...bytes);
}

export function equalBytes(bytes: Uint8Array, expected: readonly number[]): boolean {
    return (
        bytes.byteLength === expected.length &&
        expected.every((value, index) => bytes[index] === value)
    );
}

export function validateDimensions(
    width: number,
    height: number,
    policy: ImageUploadPolicy,
    mode: ImageGrammarMode,
): void {
    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width <= 0 ||
        height <= 0
    ) {
        fail('image_invalid_dimensions');
    }

    if (mode === 'classify-source') {
        if (width > policy.maxSourceDimension || height > policy.maxSourceDimension) {
            fail('image_source_dimension_exceeded');
        }
        if (width * height > policy.maxSourcePixels) {
            fail('image_source_pixels_exceeded');
        }
        return;
    }

    if (
        width > policy.maxWidth ||
        height > policy.maxHeight ||
        width * height > policy.maxDecodedPixels
    ) {
        fail('image_invalid_dimensions');
    }
}

export function result(
    mode: ImageGrammarMode,
    facts: ImageFacts,
    requiresNormalization: boolean,
): ImageGrammarResult {
    if (mode === 'validate-stored' && requiresNormalization) {
        return { outcome: 'rejected', code: 'image_metadata_not_allowed' };
    }
    return {
        outcome:
            mode === 'classify-source' && requiresNormalization
                ? 'requiresNormalization'
                : 'allowed',
        facts,
    };
}

export function validateIccProfile(profile: Uint8Array): void {
    if (
        profile.byteLength < 132 ||
        readU32Be(profile, 0) !== profile.byteLength ||
        ascii(profile.subarray(36, 40)) !== 'acsp'
    ) {
        fail('image_invalid_icc');
    }

    const tagCount = readU32Be(profile, 128);
    const tableEnd = 132 + tagCount * 12;
    if (!Number.isSafeInteger(tableEnd) || tableEnd > profile.byteLength) {
        fail('image_invalid_icc');
    }
    for (let index = 0; index < tagCount; index += 1) {
        const entry = 132 + index * 12;
        const offset = readU32Be(profile, entry + 4);
        const size = readU32Be(profile, entry + 8);
        const end = offset + size;
        if (
            offset < tableEnd ||
            size === 0 ||
            !Number.isSafeInteger(end) ||
            end > profile.byteLength
        ) {
            fail('image_invalid_icc');
        }
    }
}

export async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
        '',
    );
}

export class Crc32 {
    private value = 0xffffffff;

    update(bytes: Uint8Array): void {
        for (const byte of bytes) {
            this.value ^= byte;
            for (let bit = 0; bit < 8; bit += 1) {
                this.value = (this.value >>> 1) ^ (this.value & 1 ? 0xedb88320 : 0);
            }
        }
    }

    digest(): number {
        return (this.value ^ 0xffffffff) >>> 0;
    }
}
