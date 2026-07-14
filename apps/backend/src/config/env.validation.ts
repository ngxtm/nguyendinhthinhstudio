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
    throw new Error(`${variable} must be a non-empty even-length hexadecimal value`);
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

function validateUrl(value: string, variable: string, production: boolean): void {
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
    requiredVariables.map((variable) => [variable, getRequiredString(env, variable)]),
  ) as Record<(typeof requiredVariables)[number], string>;
  const production = env.NODE_ENV === 'production';

  validateImageDeliveryMode(env, production);
  validateHex(values.IMGPROXY_KEY, 'IMGPROXY_KEY');
  validateHex(values.IMGPROXY_SALT, 'IMGPROXY_SALT');
  validateUrl(values.R2_S3_ENDPOINT, 'R2_S3_ENDPOINT', production);
  validateUrl(values.IMGPROXY_BASE_URL, 'IMGPROXY_BASE_URL', production);

  return env;
}
