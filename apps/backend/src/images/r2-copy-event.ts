import { createHash } from 'node:crypto';
import { canonicalizeEtag } from './canonical-etag';

export type R2CopyEvent = { account: string; bucket: string; action: 'CopyObject'; object: string; copySource: string; eventTime: Date; destinationEtag: string; providerEventId: string };

function jcs(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
}

export function validateR2CopyEvent(input: unknown, expected: { account: string; bucket: string }): R2CopyEvent {
  const value: any = input;
  if (!value || value.account !== expected.account || value.bucket !== expected.bucket || value.action !== 'CopyObject') throw new Error('R2 CopyObject event identity mismatch');
  const object = typeof value.object === 'string' ? value.object : value.object?.key ?? value.destinationObjectKey;
  const copySource = typeof value.copySource === 'string' ? value.copySource : value.copySource?.key ?? value.copy_source;
  const etag = canonicalizeEtag(value.destinationEtag ?? value.etag ?? value.objectEtag ?? value.object?.etag);
  const eventTime = new Date(value.eventTime ?? value.event_time ?? value.time);
  if (!object || !copySource || Number.isNaN(eventTime.getTime())) throw new Error('Malformed R2 CopyObject event');
  const canonical = { account: value.account, bucket: value.bucket, action: value.action, object, copySource, eventTime: eventTime.toISOString() };
  return { account: value.account, bucket: value.bucket, action: 'CopyObject', object, copySource, eventTime, destinationEtag: etag, providerEventId: createHash('sha256').update(jcs(canonical)).digest('hex') };
}
