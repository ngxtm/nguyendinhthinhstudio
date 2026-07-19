import type { StoredImageErrorCode } from './error-codes.js';
import { BoundedImageReader, ImageGrammarError } from './grammar-reader.js';
import type { ImageGrammarMode, ImageGrammarResult, ImageInput } from './grammar-types.js';
import { parseJpeg } from './jpeg-grammar.js';
import { parsePng } from './png-grammar.js';
import type { ImageUploadPolicy } from './policy.js';
import { parseWebp } from './webp-grammar.js';

function rejected(code: StoredImageErrorCode): ImageGrammarResult {
    return { outcome: 'rejected', code };
}

async function parse(
    input: ImageInput,
    policy: ImageUploadPolicy,
    _mode: ImageGrammarMode,
    signal?: AbortSignal,
): Promise<ImageGrammarResult> {
    const reader = new BoundedImageReader(input, policy.preflightWorkingBytes, signal);
    try {
        const signature = await reader.readExact(12);
        reader.unread(signature);

        if (signature[0] === 0xff && signature[1] === 0xd8) {
            return await parseJpeg(reader, policy, _mode);
        }
        if (
            signature[0] === 0x89 &&
            signature[1] === 0x50 &&
            signature[2] === 0x4e &&
            signature[3] === 0x47 &&
            signature[4] === 0x0d &&
            signature[5] === 0x0a &&
            signature[6] === 0x1a &&
            signature[7] === 0x0a
        ) {
            return await parsePng(reader, policy, _mode);
        }
        if (
            signature[0] === 0x52 &&
            signature[1] === 0x49 &&
            signature[2] === 0x46 &&
            signature[3] === 0x46 &&
            signature[8] === 0x57 &&
            signature[9] === 0x45 &&
            signature[10] === 0x42 &&
            signature[11] === 0x50
        ) {
            return await parseWebp(reader, policy, _mode);
        }
        return rejected('image_unsupported_format');
    } catch (error) {
        if (error instanceof ImageGrammarError) return rejected(error.code);
        throw error;
    } finally {
        await reader.close();
    }
}

export function classifySource(
    input: ImageInput,
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
): Promise<ImageGrammarResult> {
    return parse(input, policy, 'classify-source', signal);
}

export function validateStored(
    input: ImageInput,
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
): Promise<ImageGrammarResult> {
    return parse(input, policy, 'validate-stored', signal);
}
