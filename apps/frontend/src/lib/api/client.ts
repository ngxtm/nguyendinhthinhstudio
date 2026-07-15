import { getBrowserSupabase } from '../auth/supabase';

type OriginOptions = { production?: boolean; frontendOrigin?: string };

export function validateApiOrigin(raw: string | undefined, options: OriginOptions = {}): string {
  if (!raw?.trim()) throw new Error('NEXT_PUBLIC_API_URL is required');
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('NEXT_PUBLIC_API_URL must be an absolute URL'); }
  if (raw.includes('*')) throw new Error('API origin must not contain wildcards');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API origin must use HTTP or HTTPS');
  if (url.username || url.password || url.pathname !== '/' && url.pathname !== '' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_API_URL must be an origin without credentials or path');
  }
  if (options.production && url.protocol !== 'https:') throw new Error('API origin must use HTTPS in production');
  if (options.frontendOrigin && url.origin === options.frontendOrigin) throw new Error('API origin cannot be the frontend origin');
  return url.origin;
}

export function parseAllowedOrigins(raw: string | undefined, options: { production?: boolean } = {}): Set<string> {
  const values = raw?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  if (values.length === 0) throw new Error('NEXT_PUBLIC_ADMIN_API_ORIGINS is required');
  return new Set(values.map((value) => {
    const origin = validateApiOrigin(value, { production: options.production });
    if (!options.production && new URL(origin).protocol === 'http:' && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)) {
      throw new Error('Development HTTP API origins must be loopback');
    }
    return origin;
  }));
}

function configuredApiOrigin(): string {
  const frontendOrigin = typeof window === 'undefined' ? undefined : window.location.origin;
  return validateApiOrigin(process.env.NEXT_PUBLIC_API_URL, {
    production: process.env.NODE_ENV === 'production',
    frontendOrigin,
  });
}

function allowedAdminOrigins(): Set<string> {
  return parseAllowedOrigins(process.env.NEXT_PUBLIC_ADMIN_API_ORIGINS, { production: process.env.NODE_ENV === 'production' });
}

export function isReplayableBody(body: BodyInit | null | undefined): boolean {
  if (body == null || typeof body === 'string' || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams) return true;
  if (body instanceof ReadableStream) return false;
  return body instanceof ArrayBuffer || ArrayBuffer.isView(body);
}

export class ApiError extends Error {
  constructor(public status: number, public statusText: string, public data?: unknown) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, response.statusText, error);
  }
  const type = response.headers.get('content-type') ?? '';
  return type.includes('application/json') ? response.json() : ({} as T);
}

function assertRelativeEndpoint(endpoint: string): void {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) throw new Error('API endpoint must be relative');
}

export async function publicApiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  assertRelativeEndpoint(endpoint);
  const origin = configuredApiOrigin();
  const url = new URL(endpoint, origin);
  if (url.origin !== origin) throw new Error('API endpoint resolved outside the configured origin');
  const headers = new Headers(options?.headers);
  headers.delete('Authorization');
  if (!headers.has('Content-Type') && options?.body) headers.set('Content-Type', 'application/json');
  return parse<T>(await fetch(url, { ...options, headers, redirect: 'error' }));
}

let refreshInFlight: Promise<string | null> | undefined;
let logoutInFlight: Promise<void> | undefined;

async function refreshToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = getBrowserSupabase().auth.refreshSession()
      .then(({ data }) => data.session?.access_token ?? null)
      .catch(() => null)
      .finally(() => { refreshInFlight = undefined; });
  }
  return refreshInFlight;
}

async function logoutOnce(): Promise<void> {
  if (!logoutInFlight) {
    logoutInFlight = getBrowserSupabase().auth.signOut().then(() => undefined).catch(() => undefined);
  }
  return logoutInFlight;
}

export async function adminApiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  assertRelativeEndpoint(endpoint);
  const origin = configuredApiOrigin();
  if (!allowedAdminOrigins().has(origin)) throw new Error('API origin is not allowlisted');
  const url = new URL(endpoint, origin);
  if (url.origin !== origin) throw new Error('API endpoint resolved outside the configured origin');

  const signal = options?.signal;
  if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');

  const client = getBrowserSupabase();
  const session = await client.auth.getSession();
  const initialToken = session.data.session?.access_token;
  if (!initialToken) throw new Error('Admin session is required');

  const request = async (token: string): Promise<Response> => {
    const headers = new Headers(options?.headers);
    headers.delete('Authorization');
    if (!headers.has('Content-Type') && options?.body) headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers, redirect: 'error' });
  };

  let response = await request(initialToken);
  const canRetry = isReplayableBody(options?.body);
  if (response.status === 401 && canRetry && !signal?.aborted) {
    const token = await refreshToken();
    if (token) response = await request(token);
    else await logoutOnce();
  }
  if (response.status === 401 && (!canRetry || signal?.aborted)) await logoutOnce();
  return parse<T>(response);
}

export const apiClient = publicApiClient;

export async function uploadFile(url: string, file: File, onProgress?: (progress: number) => void, timeout = 10 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = timeout;
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.((event.loaded / event.total) * 100);
    });
    xhr.addEventListener('load', () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.addEventListener('error', () => reject(new Error('Upload failed: Network error')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload failed: Timeout')));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
