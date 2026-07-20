import type { ImageUploadPolicy } from '@ndt/image-upload-policy';
import type { ConfirmResponse, PresignResponse, UploadSessionStatusResponse } from '@ndt/types';
import type { OptimizedImage, UploadCapability, ResourceLease } from './types';
import type { ImageResourceRegistry } from './resource-registry';
import { createClientRequestId } from '../api/images';

export type UploadItemState = 'queued' | 'optimizing' | 'ready' | 'presigning' | 'uploading' | 'verifying' | 'finalizing' | 'success' | 'error' | 'cancelled';
export type UploadQueueItem = { id: string; file: File; state: UploadItemState; progress: number; clientRequestId: string; uploadId?: string; optimized?: OptimizedImage; error?: string; retryAfter?: string };

export type UploadSchedulerDependencies = {
  optimize(file: File, policy: ImageUploadPolicy, capability: Extract<UploadCapability, { outcome: 'supported' }>, registry: ImageResourceRegistry, signal: AbortSignal): Promise<OptimizedImage>;
  presign(input: any): Promise<PresignResponse>;
  put(url: string, blob: Blob, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void>;
  confirm(uploadId: string): Promise<ConfirmResponse>;
  status(uploadId: string): Promise<UploadSessionStatusResponse>;
  abandon(uploadId: string): Promise<unknown>;
};

export class UploadScheduler {
  readonly items: UploadQueueItem[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private active = 0;
  private listeners = new Set<(items: readonly UploadQueueItem[]) => void>();
  constructor(private readonly policy: ImageUploadPolicy, private readonly capability: Extract<UploadCapability, { outcome: 'supported' }>, private readonly registry: ImageResourceRegistry, private readonly deps: UploadSchedulerDependencies) {}
  subscribe(listener: (items: readonly UploadQueueItem[]) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  enqueue(files: readonly File[], albumId: string) {
    for (const file of files) this.items.push({ id: createClientRequestId(), file, state: 'queued', progress: 0, clientRequestId: createClientRequestId() });
    this.emit(); this.pump(albumId);
  }
  cancel(id: string) {
    const item = this.items.find((candidate) => candidate.id === id); if (!item || ['success', 'error', 'cancelled'].includes(item.state)) return;
    item.state = 'cancelled'; this.controllers.get(id)?.abort();
    if (item.uploadId) void this.deps.abandon(item.uploadId).catch(() => undefined);
    this.emit();
  }
  retry(id: string, albumId: string) { const item = this.items.find((candidate) => candidate.id === id); if (!item || item.state !== 'error') return; item.state = item.optimized ? 'ready' : 'queued'; item.error = undefined; this.emit(); this.pump(albumId); }
  private emit() { for (const listener of this.listeners) listener(this.items); }
  private pump(albumId: string) { while (this.active < 2) { const next = this.items.find((item) => item.state === 'queued' || item.state === 'ready'); if (!next) return; this.active++; void this.process(next, albumId).finally(() => { this.active--; this.pump(albumId); }); } }
  private async process(item: UploadQueueItem, albumId: string) {
    const controller = new AbortController(); this.controllers.set(item.id, controller); let outputLease: ResourceLease | undefined;
    try {
      if (!item.optimized) { item.state = 'optimizing'; this.emit(); item.optimized = await this.deps.optimize(item.file, this.policy, this.capability, this.registry, controller.signal); outputLease = this.registry.reserve(item.id, 'output-blob'); }
      if ((item as UploadQueueItem).state === 'cancelled') return;
      item.state = 'ready'; this.emit();
      item.state = 'presigning'; this.emit();
      const response = await this.deps.presign({ clientRequestId: item.clientRequestId, albumId, filename: item.optimized.filename, contentType: item.optimized.contentType, fileSize: item.optimized.fileSize, processedSha256: item.optimized.processedSha256, policyVersion: item.optimized.policyVersion });
      if (response.outcome === 'finalizing') { item.state = 'finalizing'; item.retryAfter = response.retryAfter; this.emit(); return; }
      if (response.outcome !== 'ready') { item.state = response.outcome === 'consumed' ? 'success' : 'error'; item.error = response.outcome === 'failed' ? response.failureCode : ((response as any).code ?? 'unexpected_upload_response'); this.emit(); return; }
      item.uploadId = response.uploadId; item.state = 'uploading'; this.emit();
      await this.deps.put(response.uploadUrl, item.optimized.blob, (progress) => { item.progress = Math.min(90, progress * 0.9); this.emit(); }, controller.signal);
      if ((item as UploadQueueItem).state === 'cancelled') return;
      item.state = 'verifying'; item.progress = 90; this.emit();
      await this.verify(item, controller.signal);
    } catch (error) {
      if (item.state !== 'cancelled') { item.state = 'error'; item.error = error instanceof Error ? error.message : 'unexpected_upload_error'; this.emit(); }
    } finally { this.controllers.delete(item.id); if (item.state === 'success' || item.state === 'cancelled' || item.state === 'error') { if (outputLease) this.registry.release(outputLease); } }
  }
  private async verify(item: UploadQueueItem, signal: AbortSignal) {
    if (!item.uploadId) throw new Error('unexpected_upload_response');
    let response = await this.deps.confirm(item.uploadId);
    for (;;) {
      if (signal.aborted || item.state === 'cancelled') return;
      if (response.outcome === 'finalizing' || response.outcome === 'retryable') {
        item.state = 'finalizing'; item.retryAfter = response.retryAfter; this.emit();
        const delay = Math.max(0, new Date(response.retryAfter).getTime() - Date.now());
        await new Promise((resolve) => setTimeout(resolve, delay));
        const status = await this.deps.status(item.uploadId);
        if (status.outcome === 'pending') { response = await this.deps.confirm(item.uploadId); continue; }
        if (status.outcome === 'finalizing') { response = status as any; continue; }
        response = status as any;
      }
      if (response.outcome === 'consumed') { item.state = 'success'; item.progress = 100; this.emit(); return; }
      if (response.outcome === 'failed' || response.outcome === 'gone' || response.outcome === 'deleted' || response.outcome === 'unavailable') { item.state = 'error'; item.error = response.outcome === 'failed' ? response.failureCode : response.code; this.emit(); return; }
      throw new Error('unexpected_upload_response');
    }
  }
}
