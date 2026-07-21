import { randomUUID } from 'node:crypto';
import {
  REQUIRED_STAGING_RESOURCE_VARIABLES,
  SANITIZED_PROVIDER_READBACK,
  SANITIZED_STAGING_ENVIRONMENT,
  assertStagingR2Command,
  environmentForStagingChild,
  formatStagingCanaryEvidence,
  parseStagingResourceEnvironment,
  validateStagingCanaryEvidence,
  validateStagingProviderReadback,
  type StagingCanaryEvidence,
} from '../../test/staging-resource-contract';

const environment = (overrides: Record<string, string | undefined> = {}) => ({
  ...SANITIZED_STAGING_ENVIRONMENT,
  ...overrides,
});
describe('free-compatible staging resource contract', () => {
  it('requires the R2-only environment without Queue/Event Notification inputs', () => {
    expect(REQUIRED_STAGING_RESOURCE_VARIABLES).toHaveLength(20);
    const parsed = parseStagingResourceEnvironment(environment());
    expect(() =>
      validateStagingProviderReadback(parsed, SANITIZED_PROVIDER_READBACK),
    ).not.toThrow();
    for (const obsolete of [
      'NDT_STAGING_QUEUE_ID',
      'NDT_STAGING_DLQ_ID',
      'NDT_STAGING_HTTP_CONSUMER_ID',
      'NDT_STAGING_EVENT_RULE_ID',
      'NDT_STAGING_CF_READ_TOKEN',
    ]) {
      expect(REQUIRED_STAGING_RESOURCE_VARIABLES).not.toContain(
        obsolete as never,
      );
    }
  });

  it.each([
    ['NDT_STAGING_R2_BUCKET', 'NDT_PRODUCTION_R2_BUCKET'],
    ['NDT_STAGING_R2_ACCESS_KEY_ID', 'NDT_PRODUCTION_API_R2_ACCESS_KEY_ID'],
    [
      'NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID',
      'NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID',
    ],
    [
      'NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID',
      'NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID',
    ],
    [
      'NDT_STAGING_IMGPROXY_ACCESS_KEY_ID',
      'NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID',
    ],
  ])('rejects staging/production identity equality', (stage, prod) => {
    expect(() =>
      parseStagingResourceEnvironment(
        environment({ [stage]: SANITIZED_STAGING_ENVIRONMENT[prod] }),
      ),
    ).toThrow(/production/i);
  });

  it('rejects missing, placeholder, shared, and non-free obsolete values', () => {
    expect(() =>
      parseStagingResourceEnvironment(
        environment({ NDT_STAGING_OPERATOR_TOKEN: undefined }),
      ),
    ).toThrow(/operator/i);
    expect(() =>
      parseStagingResourceEnvironment(
        environment({ NDT_STAGING_R2_BUCKET: 'placeholder' }),
      ),
    ).toThrow(/placeholder/i);
    expect(() =>
      parseStagingResourceEnvironment(
        environment({
          NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID:
            SANITIZED_STAGING_ENVIRONMENT.NDT_STAGING_R2_ACCESS_KEY_ID,
        }),
      ),
    ).toThrow(/shared/i);
    expect(() =>
      parseStagingResourceEnvironment(
        environment({ NDT_STAGING_EVENT_RULE_ID: 'obsolete' }),
      ),
    ).toThrow(/required|obsolete/i);
  });

  it('maps only role credentials and operator token to their children', () => {
    const parsed = parseStagingResourceEnvironment(environment());
    const api = environmentForStagingChild(parsed, 'api');
    const reconciler = environmentForStagingChild(parsed, 'reconciler');
    const cutover = environmentForStagingChild(parsed, 'cutover');
    expect(api.IMAGE_UPLOAD_OPERATOR_TOKEN).toBeUndefined();
    expect(api.IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID).toBeUndefined();
    expect(reconciler.IMAGE_UPLOAD_OPERATOR_TOKEN).toBeUndefined();
    expect(reconciler.IMAGE_UPLOAD_RECONCILE_GRACE_MS).toBe('30000');
    expect(cutover.IMAGE_UPLOAD_OPERATOR_TOKEN).toBe(
      SANITIZED_STAGING_ENVIRONMENT.NDT_STAGING_OPERATOR_TOKEN,
    );
  });

  it('allows only exact same-run prefixes and create-only COPY', () => {
    const runId = '4b4f14fd-c0e4-4cc4-89b8-65aacd3f25e1';
    const source = `uploads/staging/${runId}/source.webp`;
    const destination = `albums/staging/${runId}/result.webp`;
    expect(() =>
      assertStagingR2Command({
        role: 'reconciler',
        operation: 'copy',
        runId,
        sourceKey: source,
        destinationKey: destination,
        createOnly: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertStagingR2Command({
        role: 'reconciler',
        operation: 'delete',
        runId,
        key: source,
      }),
    ).not.toThrow();
    expect(() =>
      assertStagingR2Command({
        role: 'reconciler',
        operation: 'copy',
        runId,
        sourceKey: source,
        destinationKey: destination.replace(runId, randomUUID()),
        createOnly: true,
      }),
    ).toThrow(/same run/i);
  });

  it('requires deny-canary and create-only evidence', () => {
    const evidence = {
      roles: {
        api: ['put'],
        reconciler: ['head', 'copy'],
        cutover: ['head'],
        imgproxy: ['get'],
      },
      denyCanaryRejectedRoles: ['api', 'reconciler', 'cutover', 'imgproxy'],
      createOnly: {
        secondCopyRejected: true,
        beforeEtag: 'etag',
        afterEtag: 'etag',
        beforeSha256: 'a'.repeat(64),
        afterSha256: 'a'.repeat(64),
      },
      responseLoss: {
        copyResponseLost: true,
        graceWaitMs: 30_000,
        settledByHead: true,
        exactMetadata: true,
      },
      cors: { allowedOriginPassed: true, deniedOriginRejected: true },
      imgproxy: {
        readSucceeded: true,
        writeRejected: true,
        renderedWebp: true,
      },
    } as StagingCanaryEvidence;
    expect(() => validateStagingCanaryEvidence(evidence)).not.toThrow();
    expect(() =>
      validateStagingCanaryEvidence({
        ...evidence,
        createOnly: { ...evidence.createOnly, secondCopyRejected: false },
      }),
    ).toThrow(/create-only/i);
    expect(() =>
      validateStagingCanaryEvidence({
        ...evidence,
        responseLoss: { ...evidence.responseLoss, graceWaitMs: 29_999 },
      }),
    ).toThrow(/response-loss/i);
    expect(() =>
      validateStagingCanaryEvidence({
        ...evidence,
        cors: { ...evidence.cors, deniedOriginRejected: false },
      }),
    ).toThrow(/CORS/i);
    expect(() =>
      validateStagingCanaryEvidence({
        ...evidence,
        imgproxy: { ...evidence.imgproxy, renderedWebp: false },
      }),
    ).toThrow(/imgproxy/i);
    expect(formatStagingCanaryEvidence(evidence)).toBe(
      'staging canaries: deny=4/4 createOnly=ok responseLossHead=ok graceMs=30000 cors=allowed+denied imgproxy=read-only+rendered',
    );
  });
});
