import { createHash, timingSafeEqual } from 'node:crypto';

export type ImageUploadIngressMode = 'disabled' | 'operator-smoke' | 'general';

export type ImageUploadIngressRole = 'api' | 'reconciler' | 'cutover';

export type ImageUploadIngressRuntime = Readonly<{
  presignEnabled: boolean;
  mode: ImageUploadIngressMode;
  smokeTokenSha256?: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

export const IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER =
  'x-image-upload-smoke-token' as const;
export const IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER_NAME =
  'X-Image-Upload-Smoke-Token' as const;

function strictPresignEnabled(env: Environment): boolean {
  const raw = env.IMAGE_UPLOAD_PRESIGN_ENABLED;
  if (raw !== 'true' && raw !== 'false') {
    throw new TypeError(
      'IMAGE_UPLOAD_PRESIGN_ENABLED must be exactly true or false',
    );
  }
  return raw === 'true';
}

function ingressMode(env: Environment): ImageUploadIngressMode | undefined {
  const raw = env.IMAGE_UPLOAD_INGRESS_MODE;
  if (raw === undefined) return undefined;
  if (!['disabled', 'operator-smoke', 'general'].includes(raw)) {
    throw new TypeError(
      'IMAGE_UPLOAD_INGRESS_MODE must be disabled, operator-smoke, or general',
    );
  }
  return raw as ImageUploadIngressMode;
}

function validateSmokeToken(token: string | undefined): string {
  if (token === undefined || token.length === 0) {
    throw new TypeError(
      'IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN is required in operator-smoke mode',
    );
  }
  const byteLength = Buffer.byteLength(token, 'utf8');
  if (byteLength < 32 || byteLength > 256) {
    throw new TypeError(
      'IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN must contain between 32 and 256 UTF-8 bytes',
    );
  }
  if (/[\x00-\x1f\x7f]/.test(token)) {
    throw new TypeError(
      'IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN must not contain control characters',
    );
  }
  if (
    /^(change[-_ ]?me|placeholder|todo|example|xxx|replace[-_ ]?me)$/i.test(
      token.trim(),
    )
  ) {
    throw new TypeError(
      'IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN contains a placeholder',
    );
  }
  return token;
}

export function smokeTokenFingerprint(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function parseImageUploadIngress(
  env: Environment,
  role: ImageUploadIngressRole,
): ImageUploadIngressRuntime {
  const presignEnabled = strictPresignEnabled(env);
  const configuredMode = ingressMode(env);
  const configuredToken = env.IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN;
  const token = configuredToken === '' ? undefined : configuredToken;

  if (role !== 'api') {
    if (token !== undefined) {
      throw new TypeError(
        `IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN is forbidden for ${role}`,
      );
    }
    if (presignEnabled || (configuredMode && configuredMode !== 'disabled')) {
      throw new TypeError(`upload ingress must remain disabled for ${role}`);
    }
    return Object.freeze({ presignEnabled: false, mode: 'disabled' });
  }

  if (!presignEnabled) {
    if (configuredMode !== undefined && configuredMode !== 'disabled') {
      throw new TypeError(
        'IMAGE_UPLOAD_INGRESS_MODE must be disabled when presign is disabled',
      );
    }
    if (token !== undefined) {
      throw new TypeError(
        'IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN is forbidden when ingress is disabled',
      );
    }
    return Object.freeze({ presignEnabled: false, mode: 'disabled' });
  }

  if (configuredMode === undefined || configuredMode === 'disabled') {
    throw new TypeError(
      'IMAGE_UPLOAD_INGRESS_MODE must be operator-smoke or general when presign is enabled',
    );
  }

  if (configuredMode === 'general') {
    if (token !== undefined) {
      throw new TypeError(
        'IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN is forbidden in general mode',
      );
    }
    return Object.freeze({ presignEnabled: true, mode: 'general' });
  }

  const validatedToken = validateSmokeToken(token);
  return Object.freeze({
    presignEnabled: true,
    mode: 'operator-smoke',
    smokeTokenSha256: smokeTokenFingerprint(validatedToken),
  });
}

export function matchesOperatorSmokeToken(
  runtime: ImageUploadIngressRuntime,
  header: string | string[] | undefined,
): boolean {
  if (runtime.mode !== 'operator-smoke') return true;
  if (typeof header !== 'string' || !runtime.smokeTokenSha256) return false;
  const expected = Buffer.from(runtime.smokeTokenSha256, 'hex');
  const observed = Buffer.from(smokeTokenFingerprint(header), 'hex');
  return timingSafeEqual(expected, observed);
}
