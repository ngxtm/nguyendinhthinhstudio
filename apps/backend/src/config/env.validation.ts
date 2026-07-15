type Environment = Record<string, unknown>;

const imageDeliveryModes = new Set(['legacy', 'imgproxy', 'auto']);

const requiredVariables = [
  'CLOUDFLARE_R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_S3_ENDPOINT',
  'IMGPROXY_KEY',
  'IMGPROXY_SALT',
  'IMGPROXY_BASE_URL',
] as const;

function getRequiredString(env: Environment, variable: string): string {
  const value = env[variable];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${variable} is required`);
  }

  return value;
}

function validateHex(value: string, variable: string): void {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error(
      `${variable} must be a non-empty even-length hexadecimal value`,
    );
  }
}

function validateImageDeliveryMode(
  env: Environment,
  production: boolean,
): void {
  const value = env.IMAGE_DELIVERY_MODE;

  if (value === undefined || value === null) {
    if (production) {
      throw new Error('IMAGE_DELIVERY_MODE is required');
    }

    return;
  }

  if (typeof value !== 'string' || !imageDeliveryModes.has(value)) {
    throw new Error(
      'IMAGE_DELIVERY_MODE must be one of: legacy, imgproxy, auto',
    );
  }
}

function validateSupabaseJwt(env: Environment): void {
  const supabaseUrlValue = getRequiredString(env, 'SUPABASE_URL');
  const issuerValue = getRequiredString(env, 'SUPABASE_JWT_ISSUER');
  getRequiredString(env, 'SUPABASE_JWT_AUDIENCE');
  const jwksValue = getRequiredString(env, 'SUPABASE_JWKS_URL');
  const algorithmsValue = getRequiredString(env, 'SUPABASE_JWT_ALGORITHMS');
  const mode = getRequiredString(env, 'SUPABASE_JWT_MODE');

  let supabaseUrl: URL;
  let issuer: URL;
  let jwks: URL;
  try {
    supabaseUrl = new URL(supabaseUrlValue);
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL');
  }
  try {
    issuer = new URL(issuerValue);
  } catch {
    throw new Error('SUPABASE_JWT_ISSUER must be a valid URL');
  }
  try {
    jwks = new URL(jwksValue);
  } catch {
    throw new Error('SUPABASE_JWKS_URL must be a valid URL');
  }

  if (
    supabaseUrl.protocol !== 'https:' ||
    !supabaseUrl.hostname.endsWith('.supabase.co')
  ) {
    throw new Error('SUPABASE_URL must be an HTTPS Supabase project URL');
  }
  const expectedIssuer = new URL('/auth/v1', supabaseUrl);
  if (
    issuer.href.replace(/\/$/, '') !== expectedIssuer.href.replace(/\/$/, '')
  ) {
    throw new Error('SUPABASE_JWT_ISSUER must match SUPABASE_URL/auth/v1');
  }
  const expectedJwks = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
  if (jwks.href !== expectedJwks.href) {
    throw new Error('SUPABASE_JWKS_URL must be the pinned Supabase JWKS URL');
  }

  if (mode !== 'asymmetric' && mode !== 'migration') {
    throw new Error('SUPABASE_JWT_MODE must be asymmetric or migration');
  }

  const algorithms = algorithmsValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedAlgorithms =
    mode === 'migration' ? ['HS256', 'ES256', 'RS256'] : ['ES256', 'RS256'];
  if (
    algorithms.length === 0 ||
    algorithms.some((value) => !allowedAlgorithms.includes(value)) ||
    (mode === 'migration' && !algorithms.includes('HS256'))
  ) {
    throw new Error(
      mode === 'migration'
        ? 'SUPABASE_JWT_ALGORITHMS must contain only HS256, ES256, and/or RS256'
        : 'SUPABASE_JWT_ALGORITHMS must contain only ES256 and/or RS256',
    );
  }

  const legacySecret = env.SUPABASE_JWT_SECRET;
  const removalDeadline = env.SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE;
  if (mode === 'migration') {
    if (typeof legacySecret !== 'string' || legacySecret.trim() === '') {
      throw new Error('SUPABASE_JWT_SECRET is required in migration mode');
    }
    if (typeof removalDeadline !== 'string' || removalDeadline.trim() === '') {
      throw new Error(
        'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE is required in migration mode',
      );
    }
    const deadline = Date.parse(removalDeadline);
    if (!Number.isFinite(deadline) || deadline <= Date.now()) {
      throw new Error(
        'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE must be a future date',
      );
    }
  } else {
    if (typeof legacySecret === 'string' && legacySecret.trim() !== '') {
      throw new Error(
        'SUPABASE_JWT_SECRET must not be configured in asymmetric mode',
      );
    }
    if (typeof removalDeadline === 'string' && removalDeadline.trim() !== '') {
      throw new Error(
        'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE must not be configured in asymmetric mode',
      );
    }
  }
}

function validateUrl(
  value: string,
  variable: string,
  production: boolean,
): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must be a valid URL`);
  }

  if (production && url.protocol !== 'https:') {
    throw new Error(`${variable} must use HTTPS in production`);
  }
}

export function validateEnv(env: Environment): Environment {
  const values = Object.fromEntries(
    requiredVariables.map((variable) => [
      variable,
      getRequiredString(env, variable),
    ]),
  ) as Record<(typeof requiredVariables)[number], string>;
  const production = env.NODE_ENV === 'production';

  validateImageDeliveryMode(env, production);
  validateSupabaseJwt(env);
  validateHex(values.IMGPROXY_KEY, 'IMGPROXY_KEY');
  validateHex(values.IMGPROXY_SALT, 'IMGPROXY_SALT');
  validateUrl(values.R2_S3_ENDPOINT, 'R2_S3_ENDPOINT', production);
  validateUrl(values.IMGPROXY_BASE_URL, 'IMGPROXY_BASE_URL', production);

  return env;
}
