import { createPublicKey, type JsonWebKey } from 'node:crypto';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface JwksResolverOptions {
  jwksUrl: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
  maxResponseBytes?: number;
  keyTtlMs?: number;
  negativeTtlMs?: number;
  refreshCooldownMs?: number;
  maxKeys?: number;
  maxNegativeKeys?: number;
}

type CachedKey = { pem: string; expiresAt: number };

export class JwksResolver {
  private readonly fetcher: Fetcher;
  private readonly keys = new Map<string, CachedKey>();
  private readonly negative = new Map<string, number>();
  private refreshPromise?: Promise<void>;
  private lastRefreshAt = 0;

  constructor(private readonly options: JwksResolverOptions) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  async resolve(kid: string): Promise<string> {
    if (!kid || kid.length > 256) {
      throw new Error('Invalid signing key id');
    }

    const now = Date.now();
    const cached = this.keys.get(kid);
    if (cached && cached.expiresAt > now) {
      return cached.pem;
    }
    if ((this.negative.get(kid) ?? 0) > now) {
      throw new Error('Unknown signing key');
    }

    await this.refresh();
    const refreshed = this.keys.get(kid);
    if (refreshed && refreshed.expiresAt > Date.now()) {
      return refreshed.pem;
    }

    this.putBounded(
      this.negative,
      kid,
      Date.now() + (this.options.negativeTtlMs ?? 10_000),
      this.options.maxNegativeKeys ?? 128,
    );
    throw new Error('Unknown signing key');
  }

  private async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const cooldown = this.options.refreshCooldownMs ?? 1_000;
    if (Date.now() - this.lastRefreshAt < cooldown) {
      return;
    }

    this.refreshPromise = this.fetchKeys().finally(() => {
      this.lastRefreshAt = Date.now();
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  private async fetchKeys(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 2_000);
    let response: Response;
    try {
      response = await this.fetcher(this.options.jwksUrl, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
    } catch {
      throw new Error('Unable to refresh JWKS');
    } finally {
      clearTimeout(timeout);
    }

    if (response.url && response.url !== this.options.jwksUrl) {
      throw new Error('Pinned JWKS URL mismatch');
    }
    if (!response.ok) {
      throw new Error('JWKS endpoint rejected request');
    }

    const maxBytes = this.options.maxResponseBytes ?? 64 * 1024;
    const declaredBytes = Number(response.headers.get('content-length') ?? 0);
    if (declaredBytes > maxBytes) {
      throw new Error('JWKS response is too large');
    }
    const body = await response.text();
    if (Buffer.byteLength(body) > maxBytes) {
      throw new Error('JWKS response is too large');
    }

    let document: unknown;
    try {
      document = JSON.parse(body);
    } catch {
      throw new Error('Malformed JWKS');
    }
    if (!document || typeof document !== 'object' || !Array.isArray((document as { keys?: unknown }).keys)) {
      throw new Error('Malformed JWKS');
    }

    const expiresAt = Date.now() + (this.options.keyTtlMs ?? 10 * 60_000);
    for (const candidate of (document as { keys: JsonWebKey[] }).keys) {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        typeof candidate.kid !== 'string' ||
        candidate.use !== 'sig' ||
        !['RSA', 'EC'].includes(candidate.kty ?? '') ||
        typeof candidate.alg !== 'string' ||
        !['RS256', 'ES256'].includes(candidate.alg)
      ) {
        continue;
      }
      try {
        const pem = createPublicKey({ key: candidate, format: 'jwk' })
          .export({ format: 'pem', type: 'spki' })
          .toString();
        this.putBounded(this.keys, candidate.kid, { pem, expiresAt }, this.options.maxKeys ?? 32);
        this.negative.delete(candidate.kid);
      } catch {
        throw new Error('Malformed JWKS');
      }
    }
  }

  private putBounded<K, V>(map: Map<K, V>, key: K, value: V, maximum: number): void {
    map.delete(key);
    map.set(key, value);
    while (map.size > maximum) {
      const oldest = map.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }
}
