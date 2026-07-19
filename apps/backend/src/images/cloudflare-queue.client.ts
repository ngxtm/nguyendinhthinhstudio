import { Inject, Injectable, Optional } from '@nestjs/common';

export type PulledQueueMessage = {
  id: string;
  body: unknown;
  rawBody: string;
  attempts: number;
  leaseId: string;
  leaseDeadline: Date;
  sourceQueueId: string;
  isDlq: boolean;
};

export type QueueClientOptions = {
  accountId: string;
  queueId: string;
  token: string;
  timeoutMs?: number;
  isDlq?: boolean;
};

function redact(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : '[redacted]';
}

function decodeBody(message: any): { raw: string; body: unknown } {
  const metadata = message?.metadata ?? {};
  const type = metadata['CF-Content-Type'] ?? metadata.cfContentType;
  if (type === 'json') {
    const raw = Buffer.from(String(message.body ?? ''), 'base64').toString('utf8');
    return { raw, body: JSON.parse(raw) };
  }
  if (type === 'bytes') {
    const bytes = Buffer.from(String(message.body ?? ''), 'base64');
    return { raw: bytes.toString('base64'), body: new Uint8Array(bytes) };
  }
  if (type === 'text') {
    const raw = String(message.body ?? '');
    return { raw, body: JSON.parse(raw) };
  }
  throw new Error(`Unsupported Cloudflare Queue content type: ${String(type)}`);
}

@Injectable()
export class CloudflareQueueClient {
  constructor(@Optional() @Inject('IMAGE_UPLOAD_QUEUE_CLIENT_OPTIONS') private readonly defaults?: Partial<QueueClientOptions>) {}

  async pull(batchSize = 100, visibilityTimeoutMs = 60_000, options = this.defaults ?? {}): Promise<PulledQueueMessage[]> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new RangeError('batchSize must be 1..100');
    const accountId = options.accountId; const queueId = options.queueId; const token = options.token;
    if (!accountId || !queueId || !token) throw new Error('Cloudflare Queue credentials are required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/queues/${encodeURIComponent(queueId)}/messages/pull`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ batch_size: batchSize, visibility_timeout_ms: visibilityTimeoutMs }), signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Cloudflare Queue pull failed status=${response.status} code=${payload?.errors?.[0]?.code ?? 'unknown'} account=${redact(accountId)}`);
      return (payload.result?.messages ?? []).map((message: any) => {
        const decoded = decodeBody(message);
        return { id: String(message.id), body: decoded.body, rawBody: decoded.raw, attempts: Number(message.attempts ?? 0), leaseId: String(message.lease_id ?? message.leaseId ?? ''), leaseDeadline: new Date(Date.now() + visibilityTimeoutMs), sourceQueueId: queueId, isDlq: options.isDlq === true };
      });
    } finally { clearTimeout(timer); }
  }

  async ack(leaseIds: readonly string[], options = this.defaults ?? {}): Promise<void> {
    return this.acknowledge(leaseIds, [], options);
  }

  async acknowledge(
    leaseIds: readonly string[],
    retries: readonly { leaseId: string; delaySeconds?: number }[],
    options = this.defaults ?? {},
  ): Promise<void> {
    if (leaseIds.length === 0 && retries.length === 0) return;
    const accountId = options.accountId; const queueId = options.queueId; const token = options.token;
    if (!accountId || !queueId || !token) throw new Error('Cloudflare Queue credentials are required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/queues/${encodeURIComponent(queueId)}/messages/ack`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ acks: leaseIds.map((lease_id) => ({ lease_id })), retries: retries.map((retry) => ({ lease_id: retry.leaseId, ...(retry.delaySeconds === undefined ? {} : { delay_seconds: retry.delaySeconds }) })) }), signal: controller.signal });
      if (!response.ok) throw new Error(`Cloudflare Queue ack failed status=${response.status} account=${redact(accountId)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
