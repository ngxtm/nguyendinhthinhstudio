import { CloudflareQueueClient } from './cloudflare-queue.client';

describe('CloudflareQueueClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
  it('decodes json, bytes, and text content types', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { messages: [
      { id: '1', body: Buffer.from('{"x":1}').toString('base64'), metadata: { 'CF-Content-Type': 'json' } },
      { id: '2', body: Buffer.from([1, 2]).toString('base64'), metadata: { 'CF-Content-Type': 'bytes' } },
      { id: '3', body: '{"x":3}', metadata: { 'CF-Content-Type': 'text' } },
    ] } }) });
    const result = await new CloudflareQueueClient().pull(3, 30, { accountId: 'account', queueId: 'queue', token: 'secret' });
    expect(result[0]?.body).toEqual({ x: 1 });
    expect(result[1]?.body).toEqual(new Uint8Array([1, 2]));
    expect(result[2]?.body).toEqual({ x: 3 });
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.authorization).toBe('Bearer secret');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ batch_size: 3, visibility_timeout_ms: 30 });
  });
  it('rejects non-2xx without exposing the token', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ errors: [{ code: 42 }] }) });
    await expect(new CloudflareQueueClient().pull(1, 30, { accountId: 'account', queueId: 'queue', token: 'secret' })).rejects.toThrow('status=500');
  });

  it('acknowledges and retries exact leases with bounded delay', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await new CloudflareQueueClient().acknowledge(['lease-a'], [{ leaseId: 'lease-b', delaySeconds: 15 }], { accountId: 'account', queueId: 'queue', token: 'secret' });
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ acks: [{ lease_id: 'lease-a' }], retries: [{ lease_id: 'lease-b', delay_seconds: 15 }] });
  });
});
