import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createProductionSmokeLiveAdapter,
  type ProductionSmokeObjectIdentity,
} from './image-upload-production-smoke-live';

const TOKEN = 'smoke-secret-that-must-never-leak';
const JWT = 'admin-jwt-that-must-never-leak';
const SIGNAL = new AbortController().signal;

async function listen(
  handler: RequestListener,
): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}` };
}

function identity(
  overrides: Partial<ProductionSmokeObjectIdentity> = {},
): ProductionSmokeObjectIdentity {
  return {
    etag: 'etag-1',
    contentLength: 24,
    contentType: 'image/webp',
    metadata: {
      sha256: 'a'.repeat(64),
      bytes: '24',
      width: '2',
      height: '2',
    },
    ...overrides,
  };
}

function harness(options: {
  apiBaseUrl: string;
  imgproxyBaseUrl?: string;
  browserPut?: jest.Mock;
  headObject?: jest.Mock;
  decodeImage?: jest.Mock;
}) {
  const resources: Array<{ kind: string; id: string; objectKey?: string }> = [];
  const adapter = createProductionSmokeLiveAdapter(
    {
      apiBaseUrl: options.apiBaseUrl,
      imgproxyBaseUrl: options.imgproxyBaseUrl ?? 'https://img.example.test',
      allowedBrowserOrigin: 'https://www.example.test',
      deniedBrowserOrigin: 'http://127.0.0.1:17777',
      adminBearerToken: JWT,
      smokeToken: TOKEN,
      requestTimeoutMs: 1_000,
      pollIntervalMs: 1,
    },
    {
      browserPut:
        options.browserPut ?? jest.fn().mockResolvedValue({ ok: true }),
      headObject: options.headObject ?? jest.fn().mockResolvedValue(identity()),
      decodeImage:
        options.decodeImage ??
        jest.fn().mockResolvedValue({ width: 2, height: 2 }),
      recordResource: async (resource) => {
        resources.push(resource);
      },
    },
  );
  return { adapter, resources };
}

describe('production smoke live adapter', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
    );
  });

  it('sends credentials only to the configured API origin and refuses credentialed redirects', async () => {
    const received: Array<Record<string, string | string[] | undefined>> = [];
    const target = await listen((request, response) => {
      received.push(request.headers);
      response.end('{}');
    });
    servers.push(target.server);
    const api = await listen((_request, response) => {
      response.statusCode = 302;
      response.setHeader('location', `${target.origin}/stolen`);
      response.end();
    });
    servers.push(api.server);
    const { adapter } = harness({ apiBaseUrl: api.origin });

    await expect(
      adapter.createUpload(
        {
          clientRequestId: '00000000-0000-4000-8000-000000000000',
          albumId: 'album-1',
          filename: 'redirect.webp',
          contentType: 'image/webp',
          fileSize: 24,
          processedSha256: 'a'.repeat(64),
        },
        SIGNAL,
      ),
    ).rejects.toThrow('production smoke API request failed');
    expect(received).toEqual([]);
    expect('getUploadPolicy' in adapter).toBe(false);
    expect(() => adapter.resolveApiUrl(`${target.origin}/stolen`)).toThrow(
      'production smoke API path must be relative',
    );
  });

  it('reuses clientRequestId and proves upload id plus absolute expiry are unchanged', async () => {
    const bodies: unknown[] = [];
    const api = await listen((request, response) => {
      request.setEncoding('utf8');
      let body = '';
      request.on('data', (part) => (body += part));
      request.on('end', () => {
        bodies.push(JSON.parse(body));
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            outcome: 'ready',
            uploadId: 'upload-1',
            uploadUrl: `${api.origin}/bucket/uploads/upload-1/smoke.webp`,
            expiresAt: '2026-07-23T12:00:00.000Z',
          }),
        );
      });
    });
    servers.push(api.server);
    const { adapter, resources } = harness({ apiBaseUrl: api.origin });
    const input = {
      clientRequestId: '00000000-0000-4000-8000-000000000001',
      albumId: 'album-1',
      filename: 'smoke.webp',
      contentType: 'image/webp',
      fileSize: 24,
      processedSha256: 'a'.repeat(64),
    } as const;

    const result = await adapter.proveAbsoluteExpiryRetry(input, SIGNAL);

    expect(result.uploadId).toBe('upload-1');
    expect(bodies).toEqual([input, input]);
    expect(resources).toEqual([
      { kind: 'upload', id: 'upload-1' },
      {
        kind: 'object',
        id: 'upload-1:source',
        objectKey: 'uploads/upload-1/smoke.webp',
      },
    ]);
  });

  it('journals a created upload before confirm and exposes only owner-scoped API operations', async () => {
    const requests: Array<{ method?: string; url?: string; body?: unknown }> =
      [];
    const api = await listen((request, response) => {
      request.setEncoding('utf8');
      let body = '';
      request.on('data', (part) => (body += part));
      request.on('end', () => {
        requests.push({
          method: request.method,
          url: request.url,
          body: body ? JSON.parse(body) : undefined,
        });
        response.setHeader('content-type', 'application/json');
        if (request.url === '/images/upload-url') {
          response.end(
            JSON.stringify({
              outcome: 'ready',
              uploadId: 'upload-2',
              uploadUrl: `${api.origin}/uploads/upload-2/smoke.webp`,
              expiresAt: '2026-07-23T12:00:00.000Z',
            }),
          );
        } else if (request.url === '/images/confirm-upload') {
          response.end(
            JSON.stringify({ outcome: 'finalizing', uploadId: 'upload-2' }),
          );
        } else {
          response.end(JSON.stringify({ message: 'deleted' }));
        }
      });
    });
    servers.push(api.server);
    const { adapter, resources } = harness({ apiBaseUrl: api.origin });
    const input = {
      clientRequestId: '00000000-0000-4000-8000-000000000002',
      albumId: '00000000-0000-4000-8000-000000000010',
      filename: 'smoke.webp',
      contentType: 'image/webp',
      fileSize: 24,
      processedSha256: 'a'.repeat(64),
    } as const;

    const upload = await adapter.createUpload(input, SIGNAL);
    await expect(
      adapter.confirmUpload(upload.uploadId, SIGNAL),
    ).resolves.toMatchObject({
      outcome: 'finalizing',
    });
    await adapter.deleteImage('image-2', SIGNAL);

    expect(resources).toHaveLength(2);
    expect(requests).toEqual([
      { method: 'POST', url: '/images/upload-url', body: input },
      {
        method: 'POST',
        url: '/images/confirm-upload',
        body: { uploadId: 'upload-2' },
      },
      { method: 'DELETE', url: '/images/image-2', body: undefined },
    ]);
  });

  it('requires browser success plus present HEAD for allowed CORS and browser rejection plus absent HEAD for denied CORS', async () => {
    const browserPut = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, errorName: 'TypeError' });
    const headObject = jest
      .fn()
      .mockResolvedValueOnce(identity())
      .mockResolvedValueOnce(null);
    const { adapter } = harness({
      apiBaseUrl: 'https://api.example.test',
      browserPut,
      headObject,
    });
    const upload = {
      uploadId: 'upload-1',
      uploadUrl: 'https://r2.example.test/uploads/upload-1/smoke.webp?secret=1',
      objectKey: 'uploads/upload-1/smoke.webp',
      expiresAt: '2026-07-23T12:00:00.000Z',
    };

    await adapter.proveAllowedCorsPut(upload, new Uint8Array(24), SIGNAL);
    await adapter.proveDeniedCorsPut(upload, new Uint8Array(24), SIGNAL);

    expect(browserPut.mock.calls[0][0].origin).toBe('https://www.example.test');
    expect(browserPut.mock.calls[1][0].origin).toBe('http://127.0.0.1:17777');
    expect(headObject).toHaveBeenCalledTimes(2);
  });

  it('polls owner-scoped status until the upload settles', async () => {
    let attempts = 0;
    const api = await listen((_request, response) => {
      attempts += 1;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify(
          attempts === 1
            ? { outcome: 'finalizing', uploadId: 'upload-1' }
            : {
                outcome: 'consumed',
                uploadId: 'upload-1',
                resultImageId: 'image-1',
              },
        ),
      );
    });
    servers.push(api.server);
    const { adapter } = harness({ apiBaseUrl: api.origin });

    await expect(
      adapter.getUploadStatus('upload-1', SIGNAL),
    ).resolves.toMatchObject({ outcome: 'finalizing' });
    await expect(
      adapter.pollUploadTerminal('upload-1', Date.now() + 500, SIGNAL),
    ).resolves.toMatchObject({ outcome: 'consumed', resultImageId: 'image-1' });
    expect(attempts).toBe(2);
  });

  it('proves destination identity is unchanged including SHA metadata', async () => {
    const headObject = jest.fn().mockResolvedValue(identity());
    const { adapter } = harness({
      apiBaseUrl: 'https://api.example.test',
      headObject,
    });

    await expect(
      adapter.proveObjectUnchanged(
        'albums/album-1/image.webp',
        identity(),
        SIGNAL,
      ),
    ).resolves.toEqual(identity());

    headObject.mockResolvedValueOnce(
      identity({
        metadata: { ...identity().metadata, sha256: 'b'.repeat(64) },
      }),
    );
    await expect(
      adapter.proveObjectUnchanged(
        'albums/album-1/image.webp',
        identity(),
        SIGNAL,
      ),
    ).rejects.toThrow('production smoke object identity changed');
  });

  it('verifies imgproxy origin, WebP type, status, and decoded dimensions', async () => {
    const api = await listen((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'image/webp');
      response.end(Buffer.from('webp'));
    });
    servers.push(api.server);
    const { adapter } = harness({
      apiBaseUrl: 'https://api.example.test',
      imgproxyBaseUrl: api.origin,
    });

    await expect(
      adapter.proveImgproxyRendering(`${api.origin}/signed/path`, SIGNAL),
    ).resolves.toEqual({ width: 2, height: 2 });
    await expect(
      adapter.proveImgproxyRendering(
        'https://attacker.example/signed/path',
        SIGNAL,
      ),
    ).rejects.toThrow('production smoke imgproxy origin mismatch');
  });

  it('sanitizes dependency failures without URLs, tokens, or query strings', async () => {
    const browserPut = jest
      .fn()
      .mockRejectedValue(
        new Error(
          `failed ${TOKEN} ${JWT} https://r2.example.test/key?X-Amz-Signature=secret`,
        ),
      );
    const { adapter } = harness({
      apiBaseUrl: 'https://api.example.test',
      browserPut,
    });

    let failure: Error;
    try {
      await adapter.proveAllowedCorsPut(
        {
          uploadId: 'upload-1',
          uploadUrl: 'https://r2.example.test/key?X-Amz-Signature=secret',
          objectKey: 'uploads/upload-1/smoke.webp',
          expiresAt: '2026-07-23T12:00:00.000Z',
        },
        new Uint8Array(24),
        SIGNAL,
      );
      throw new Error('expected browser PUT to fail');
    } catch (error) {
      failure = error as Error;
    }

    expect(failure.message).toBe('production smoke browser PUT failed');
    expect(failure.message).not.toContain(TOKEN);
    expect(failure.message).not.toContain(JWT);
    expect(failure.message).not.toContain('http');
    expect(failure.message).not.toContain('?');
  });
});
