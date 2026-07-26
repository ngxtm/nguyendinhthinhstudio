import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

function configuredOrigin(raw: string | undefined, name: string, production: boolean): string {
  if (!raw?.trim()) throw new Error(`${name} is required for admin security headers`);
  if (raw.includes('*')) throw new Error(`${name} must not contain wildcards`);
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (url.protocol !== 'https:' && (production || url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== '[::1]')) {
    throw new Error(`${name} must use HTTPS outside loopback development`);
  }
  if (url.username || url.password || url.pathname !== '/' && url.pathname !== '' || url.search || url.hash) {
    throw new Error(`${name} must be an origin without credentials or path`);
  }
  return url.origin;
}

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/admin')) return NextResponse.next();

  const nonce = randomBytes(16).toString('base64');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const production = process.env.NODE_ENV === 'production';
  const api = configuredOrigin(process.env.NEXT_PUBLIC_API_URL, 'NEXT_PUBLIC_API_URL', production);
  const supabase = configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL', production);
  // R2 presigned PUT URLs land on <account>.r2.cloudflarestorage.com during
  // direct-to-storage uploads (image pipeline + staff avatars). Allow the
  // R2 host family so browser uploads aren't blocked by connect-src.
  const connect = ["'self'", api, supabase, 'https://*.r2.cloudflarestorage.com'].join(' ');
  const reportOnly = process.env.ADMIN_CSP_REPORT_ONLY === 'true';
  // React dev mode uses eval() for stack reconstruction; allow it only outside production.
  const scriptSrc = production
    ? `script-src 'self' 'nonce-${nonce}'`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`;
  // Local imgproxy serves http://localhost:8080 in dev (prod uses https://img.ndtstudio.site
  // already covered by 'https:'). Allow loopback imgproxy only outside production.
  const imgSrc = production
    ? "img-src 'self' data: blob: https:"
    : "img-src 'self' data: blob: https: http://localhost:8080 http://127.0.0.1:8080";
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connect}`,
    imgSrc,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  response.headers.set(reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export const config = { matcher: ['/admin/:path*'] };
