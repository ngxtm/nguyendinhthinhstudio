import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260719000100_image_upload_roll_forward/migration.sql',
  ),
  'utf8',
);

describe('free-compatible image upload polling schema', () => {
  it.each([['schema.prisma', schema], ['migration.sql', migration]])(
    '%s stores complete destination HEAD settlement evidence',
    (_name, source) => {
      for (const field of [
        'destinationHeadObservedAt',
        'destinationHeadEtag',
        'destinationHeadBytes',
        'destinationHeadMime',
        'destinationHeadMetadataSha256',
      ]) {
        expect(source).toContain(field);
      }
    },
  );

  it.each([['schema.prisma', schema], ['migration.sql', migration]])(
    '%s has no provider-event, Queue, DLQ, replay, or quarantine persistence',
    (_name, source) => {
      for (const obsolete of [
        'providerEventId',
        'sourceQueueId',
        'currentQueueId',
        'queueSettlementCompletedAt',
        'ImageUploadProviderEventQuarantine',
        'replayRequestId',
      ]) {
        expect(source).not.toContain(obsolete);
      }
    },
  );

  it.each([['schema.prisma', schema], ['migration.sql', migration]])(
    '%s models destination mismatch conflicts without event identity',
    (_name, source) => {
      expect(source).toContain('destinationMetadataSha256');
      expect(source).toContain('mismatchReason');
      expect(source).toContain('confirmed_absent');
      expect(source).not.toContain('confirmed_absent_ack');
    },
  );
});
