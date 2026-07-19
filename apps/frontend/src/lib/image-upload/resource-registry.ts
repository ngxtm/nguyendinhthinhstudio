import type { ImageResourceKind, ResourceLease, ResourceSnapshot } from './types';

const SURFACE_KINDS = new Set<ImageResourceKind>(['image-bitmap', 'canvas', 'worker-surface', 'thumbnail', 'preview-image']);

export interface ImageResourceRegistry {
  reserve(itemId: string, kind: ImageResourceKind): ResourceLease;
  transfer(lease: ResourceLease, nextOwner: string): ResourceLease;
  release(lease: ResourceLease): void;
  snapshot(): Readonly<ResourceSnapshot>;
}

export class BoundedImageResourceRegistry implements ImageResourceRegistry {
  private readonly active = new Map<symbol, ResourceLease>();
  private readonly invalidated = new Set<symbol>();
  reserve(itemId: string, kind: ImageResourceKind): ResourceLease {
    const surfaces = [...this.active.values()].filter((lease) => SURFACE_KINDS.has(lease.kind)).length;
    const blobs = [...this.active.values()].filter((lease) => lease.kind === 'output-blob').length;
    if (SURFACE_KINDS.has(kind) && surfaces >= 2) throw new Error('image_resource_surface_limit');
    if (kind === 'output-blob' && blobs >= 2) throw new Error('image_resource_blob_limit');
    const lease = Object.freeze({ itemId, kind, token: Symbol(itemId), owner: itemId });
    this.active.set(lease.token, lease);
    return lease;
  }
  transfer(lease: ResourceLease, nextOwner: string): ResourceLease {
    const current = this.active.get(lease.token);
    if (!current || current.itemId !== lease.itemId || current.owner !== lease.owner) throw new Error('image_resource_lease_invalid');
    this.active.delete(lease.token);
    this.invalidated.add(lease.token);
    const next = Object.freeze({ itemId: lease.itemId, kind: lease.kind, token: Symbol(lease.itemId), owner: nextOwner });
    this.active.set(next.token, next);
    return next;
  }
  release(lease: ResourceLease): void {
    const current = this.active.get(lease.token);
    if (!current) {
      if (this.invalidated.has(lease.token)) throw new Error('image_resource_lease_invalid');
      return;
    }
    if (current.itemId !== lease.itemId || current.owner !== lease.owner) throw new Error('image_resource_lease_invalid');
    this.active.delete(lease.token);
  }
  snapshot(): Readonly<ResourceSnapshot> {
    const leases = [...this.active.values()];
    return Object.freeze({ decodedOrVisibleSurfaces: leases.filter((lease) => SURFACE_KINDS.has(lease.kind)).length, residentOutputBlobs: leases.filter((lease) => lease.kind === 'output-blob').length, total: leases.length, leases: Object.freeze(leases) });
  }
}
