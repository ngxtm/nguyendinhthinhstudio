import { validateStored, type ImageUploadPolicy } from '@ndt/image-upload-policy';

export class ImageEncoderError extends Error { constructor(readonly code: 'image_encode_failed' | 'image_bad_length' | 'image_unsupported_format') { super(code); } }

async function* blobChunks(blob: Blob): AsyncIterable<Uint8Array> { yield new Uint8Array(await blob.arrayBuffer()); }

export async function encodeWebpOnce(surface: { convertToBlob(options: { type: 'image/webp'; quality: number }): Promise<Blob> }, policy: ImageUploadPolicy, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) throw Object.assign(new Error('Encode aborted'), { name: 'AbortError' });
  let blob: Blob;
  try { blob = await surface.convertToBlob({ type: 'image/webp', quality: policy.webpQuality }); } catch { throw new ImageEncoderError('image_encode_failed'); }
  if (signal?.aborted) throw Object.assign(new Error('Encode aborted'), { name: 'AbortError' });
  if (blob.type !== 'image/webp' || blob.size === 0) throw new ImageEncoderError('image_unsupported_format');
  if (blob.size > policy.maxStoredBytes) throw new ImageEncoderError('image_bad_length');
  const grammar = await validateStored(blobChunks(blob), policy, signal);
  if (grammar.outcome === 'rejected') throw new ImageEncoderError(grammar.code === 'image_bad_length' ? 'image_bad_length' : grammar.code === 'image_unsupported_format' ? 'image_unsupported_format' : 'image_encode_failed');
  return blob;
}

export type WorkerEncodeRequest = { kind: 'encode'; requestId: string; policy: ImageUploadPolicy; surface: unknown };

export function installOptimizerWorker(scope: { addEventListener(type: 'message', listener: (event: MessageEvent<WorkerEncodeRequest>) => void): void; postMessage(message: unknown): void }) {
  scope.addEventListener('message', async (event) => {
    if (event.data.kind !== 'encode') return;
    try { const blob = await encodeWebpOnce(event.data.surface as any, event.data.policy); scope.postMessage({ kind: 'encoded', requestId: event.data.requestId, blob }); }
    catch (error) { scope.postMessage({ kind: 'error', requestId: event.data.requestId, code: error instanceof ImageEncoderError ? error.code : 'image_encode_failed' }); }
  });
}

export function canvasToBlobOnce(canvas: { toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void }, policy: ImageUploadPolicy, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('Encode aborted'), { name: 'AbortError' })); return; }
    let settled = false;
    canvas.toBlob(async (blob) => {
      if (settled) return;
      settled = true;
      if (signal?.aborted) { reject(Object.assign(new Error('Encode aborted'), { name: 'AbortError' })); return; }
      if (!blob) { reject(new ImageEncoderError('image_encode_failed')); return; }
      try { resolve(await encodeWebpOnce({ convertToBlob: async () => blob }, policy, signal)); } catch (error) { reject(error); }
    }, 'image/webp', policy.webpQuality);
  });
}
