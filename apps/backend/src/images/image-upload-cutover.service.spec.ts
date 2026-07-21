import { assertPollingGate, assertTwoPollingSnapshots } from './image-upload-cutover.service';

const snapshot = (overrides: Partial<Parameters<typeof assertPollingGate>[0]> = {}) => ({
  observedAt: new Date('2026-07-21T00:00:00.000Z'),
  unresolvedPromotions: 0,
  invalidSettlement: 0,
  openConflicts: 0,
  dueTemporaryCleanup: 0,
  unresolvedImageDeletion: 0,
  corsMismatch: 0,
  ...overrides,
});

describe('image upload polling cutover gates', () => {
  it('accepts two clean snapshots separated by 30 seconds', () => {
    expect(() => assertTwoPollingSnapshots(snapshot(), snapshot({ observedAt: new Date('2026-07-21T00:00:30.000Z') }))).not.toThrow();
  });
  it('rejects a non-zero or malformed gate', () => {
    expect(() => assertPollingGate(snapshot({ openConflicts: 1 }))).toThrow(/openConflicts/);
    expect(() => assertPollingGate(snapshot({ unresolvedPromotions: -1 }))).toThrow(/unresolvedPromotions/);
  });
  it('rejects snapshots before the response-loss barrier', () => {
    expect(() => assertTwoPollingSnapshots(snapshot(), snapshot({ observedAt: new Date('2026-07-21T00:00:29.999Z') }))).toThrow(/30-second/);
  });
});
