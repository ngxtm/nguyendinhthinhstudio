export type PollingGateSnapshot = Readonly<{
  observedAt: Date;
  unresolvedPromotions: number;
  invalidSettlement: number;
  openConflicts: number;
  dueTemporaryCleanup: number;
  unresolvedImageDeletion: number;
  corsMismatch: number;
}>;

const ZERO_KEYS = [
  'unresolvedPromotions',
  'invalidSettlement',
  'openConflicts',
  'dueTemporaryCleanup',
  'unresolvedImageDeletion',
  'corsMismatch',
] as const;

export function assertPollingGate(snapshot: PollingGateSnapshot): void {
  for (const key of ZERO_KEYS) {
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) {
      throw new Error(`invalid polling gate ${key}`);
    }
    if (snapshot[key] !== 0) throw new Error(`polling gate ${key} is non-zero`);
  }
}

export function assertTwoPollingSnapshots(
  first: PollingGateSnapshot,
  second: PollingGateSnapshot,
  barrierMs = 30_000,
): void {
  assertPollingGate(first);
  assertPollingGate(second);
  if (second.observedAt.getTime() - first.observedAt.getTime() < barrierMs) {
    throw new Error('polling snapshots are not separated by the 30-second barrier');
  }
}
