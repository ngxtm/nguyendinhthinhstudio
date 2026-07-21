import type { StoredImageErrorCode } from './error-codes.js';
import type { ImageByteReader, ImageInput } from './grammar-types.js';

export class ImageGrammarError extends Error {
    constructor(readonly code: StoredImageErrorCode) {
        super(code);
    }
}

function abortError(): Error {
    if (typeof DOMException !== 'undefined') {
        return new DOMException('Image parsing aborted', 'AbortError');
    }
    const error = new Error('Image parsing aborted');
    error.name = 'AbortError';
    return error;
}

export class BoundedImageReader implements ImageByteReader {
    private readonly iterator: AsyncIterator<Uint8Array>;
    private current: Uint8Array | null = null;
    private currentOffset = 0;
    private readonly pushedBack: Uint8Array[] = [];
    private closed = false;
    private totalBytesRead = 0;

    constructor(
        input: ImageInput,
        private readonly workingBytes: number,
        private readonly signal?: AbortSignal,
    ) {
        this.iterator = input[Symbol.asyncIterator]();
    }

    get bytesRead(): number {
        return this.totalBytesRead;
    }

    private checkAbort(): void {
        if (this.signal?.aborted) throw abortError();
    }

    private async nextIteratorValue(): Promise<IteratorResult<Uint8Array>> {
        this.checkAbort();
        const pending = this.iterator.next();
        const signal = this.signal;
        if (signal === undefined) return pending;

        return new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
            let settled = false;
            const finish = (callback: () => void): void => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                callback();
            };
            const onAbort = (): void => finish(() => reject(abortError()));
            signal.addEventListener('abort', onAbort, { once: true });
            pending.then(
                (value) => finish(() => resolve(value)),
                (error) => finish(() => reject(error)),
            );
            if (signal.aborted) onAbort();
        });
    }

    private async nextChunk(): Promise<boolean> {
        this.checkAbort();
        if (this.pushedBack.length > 0) {
            this.current = this.pushedBack.shift() ?? null;
            this.currentOffset = 0;
            return this.current !== null;
        }

        for (;;) {
            const next = await this.nextIteratorValue();
            this.checkAbort();
            if (next.done) {
                this.current = null;
                this.currentOffset = 0;
                return false;
            }
            if (!(next.value instanceof Uint8Array)) {
                throw new TypeError('ImageInput must yield Uint8Array chunks');
            }
            if (next.value.byteLength === 0) continue;
            this.current = next.value;
            this.currentOffset = 0;
            return true;
        }
    }

    async readByte(): Promise<number | null> {
        this.checkAbort();
        while (this.current === null || this.currentOffset >= this.current.byteLength) {
            if (!(await this.nextChunk())) return null;
        }
        this.totalBytesRead += 1;
        return this.current[this.currentOffset++];
    }

    async readExact(length: number): Promise<Uint8Array> {
        if (!Number.isSafeInteger(length) || length < 0) {
            throw new ImageGrammarError('image_bad_length');
        }
        if (length > this.workingBytes) {
            throw new ImageGrammarError('image_metadata_budget_exceeded');
        }

        const output = new Uint8Array(length);
        for (let index = 0; index < length; index += 1) {
            const value = await this.readByte();
            if (value === null) throw new ImageGrammarError('image_truncated');
            output[index] = value;
        }
        return output;
    }

    unread(bytes: Uint8Array): void {
        if (bytes.byteLength === 0) return;
        if (bytes.byteLength > this.workingBytes) {
            throw new ImageGrammarError('image_metadata_budget_exceeded');
        }
        if (bytes.byteLength > this.totalBytesRead) {
            throw new Error('cannot unread bytes that were not consumed');
        }
        const remaining = this.current === null ? null : this.current.subarray(this.currentOffset);
        this.current = null;
        this.currentOffset = 0;
        if (remaining !== null && remaining.byteLength > 0) {
            this.pushedBack.unshift(remaining);
        }
        this.pushedBack.unshift(bytes);
        this.totalBytesRead -= bytes.byteLength;
    }

    async skip(length: number, visit?: (chunk: Uint8Array) => void): Promise<void> {
        if (!Number.isSafeInteger(length) || length < 0) {
            throw new ImageGrammarError('image_bad_length');
        }

        let remaining = length;
        while (remaining > 0) {
            this.checkAbort();
            while (this.current === null || this.currentOffset >= this.current.byteLength) {
                if (!(await this.nextChunk())) {
                    throw new ImageGrammarError('image_truncated');
                }
            }
            const available = this.current.byteLength - this.currentOffset;
            const take = Math.min(available, remaining);
            const chunk = this.current.subarray(this.currentOffset, this.currentOffset + take);
            visit?.(chunk);
            this.currentOffset += take;
            this.totalBytesRead += take;
            remaining -= take;
        }
    }

    async ensureEof(): Promise<boolean> {
        this.checkAbort();
        if (
            this.pushedBack.length > 0 ||
            (this.current !== null && this.currentOffset < this.current.byteLength)
        ) {
            return false;
        }
        return !(await this.nextChunk());
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        const close = this.iterator.return?.();
        if (close === undefined) return;
        if (this.signal?.aborted) {
            void Promise.resolve(close).catch(() => undefined);
            return;
        }
        await close;
    }
}
