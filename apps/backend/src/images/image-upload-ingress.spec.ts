import {
  IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER,
  IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER_NAME,
  matchesOperatorSmokeToken,
  parseImageUploadIngress,
  smokeTokenFingerprint,
} from './image-upload-ingress';

const token = 'operator-smoke-token-with-at-least-32-bytes';

describe('image upload ingress', () => {
  it.each([
    [{ IMAGE_UPLOAD_PRESIGN_ENABLED: 'false' }, 'disabled'],
    [
      {
        IMAGE_UPLOAD_PRESIGN_ENABLED: 'false',
        IMAGE_UPLOAD_INGRESS_MODE: 'disabled',
        IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: '',
      },
      'disabled',
    ],
    [
      {
        IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
        IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
        IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
      },
      'operator-smoke',
    ],
    [
      {
        IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
        IMAGE_UPLOAD_INGRESS_MODE: 'general',
        IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: '',
      },
      'general',
    ],
  ])('accepts valid API ingress state %#', (env, mode) => {
    expect(parseImageUploadIngress(env, 'api').mode).toBe(mode);
  });

  it.each([
    { IMAGE_UPLOAD_PRESIGN_ENABLED: 'true' },
    {
      IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
      IMAGE_UPLOAD_INGRESS_MODE: 'disabled',
    },
    {
      IMAGE_UPLOAD_PRESIGN_ENABLED: 'false',
      IMAGE_UPLOAD_INGRESS_MODE: 'general',
    },
    {
      IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
      IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
    },
    {
      IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
      IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
      IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: 'too-short',
    },
    {
      IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
      IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
      IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: 'a'.repeat(257),
    },
    {
      IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
      IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
      IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: `${'a'.repeat(32)}\n`,
    },
    {
      IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
      IMAGE_UPLOAD_INGRESS_MODE: 'general',
      IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
    },
  ])('rejects unsafe API ingress state %#', (env) => {
    expect(() => parseImageUploadIngress(env, 'api')).toThrow();
  });

  it.each(['reconciler', 'cutover'] as const)(
    'keeps %s disabled and rejects the API smoke secret',
    (role) => {
      expect(
        parseImageUploadIngress(
          { IMAGE_UPLOAD_PRESIGN_ENABLED: 'false' },
          role,
        ),
      ).toEqual({ presignEnabled: false, mode: 'disabled' });
      expect(() =>
        parseImageUploadIngress(
          {
            IMAGE_UPLOAD_PRESIGN_ENABLED: 'false',
            IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
          },
          role,
        ),
      ).toThrow('IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN');
      expect(() =>
        parseImageUploadIngress(
          {
            IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
            IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
            IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
          },
          role,
        ),
      ).toThrow(role);
    },
  );

  it('stores only the smoke-token fingerprint', () => {
    const parsed = parseImageUploadIngress(
      {
        IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
        IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
        IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
      },
      'api',
    );

    expect(parsed).toEqual({
      presignEnabled: true,
      mode: 'operator-smoke',
      smokeTokenSha256: smokeTokenFingerprint(token),
    });
    expect(JSON.stringify(parsed)).not.toContain(token);
  });

  it('accepts exactly one correct operator header', () => {
    const runtime = parseImageUploadIngress(
      {
        IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
        IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
        IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
      },
      'api',
    );

    expect(IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER).toBe(
      'x-image-upload-smoke-token',
    );
    expect(IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER_NAME).toBe(
      'X-Image-Upload-Smoke-Token',
    );
    expect(matchesOperatorSmokeToken(runtime, token)).toBe(true);
    expect(matchesOperatorSmokeToken(runtime, `${token}-wrong`)).toBe(false);
    expect(matchesOperatorSmokeToken(runtime, undefined)).toBe(false);
    expect(matchesOperatorSmokeToken(runtime, [token])).toBe(false);
    expect(matchesOperatorSmokeToken(runtime, [token, token])).toBe(false);
  });

  it('does not require an operator header outside operator mode', () => {
    const disabled = parseImageUploadIngress(
      { IMAGE_UPLOAD_PRESIGN_ENABLED: 'false' },
      'api',
    );
    const general = parseImageUploadIngress(
      {
        IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
        IMAGE_UPLOAD_INGRESS_MODE: 'general',
      },
      'api',
    );

    expect(matchesOperatorSmokeToken(disabled, undefined)).toBe(true);
    expect(matchesOperatorSmokeToken(general, undefined)).toBe(true);
  });
});
