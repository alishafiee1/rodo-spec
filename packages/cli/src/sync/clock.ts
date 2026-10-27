/** ref/12 §5.1. `offsetMs = serverTimeMs + rtt/2 - localNowAfter`; unreachable server = 0. */
export function computeOffset(sentAt: number, receivedAt: number, serverTimeMs: number): number {
  const rtt = receivedAt - sentAt;
  return Math.round(serverTimeMs + rtt / 2 - receivedAt);
}

/**
 * G1: the file's save time is the edit time. The run time is only the upper bound; the card's last sync is the lower bound
 * (a restore that keeps an old mtime counts as made right after the last sync, never before it).
 */
export function editedAt(i: { mtimeMs: number; offsetMs: number; lastSyncAt: number; nowMs: number }): number {
  const upper = i.nowMs + i.offsetMs;
  const lower = Math.min(i.lastSyncAt, upper);
  return Math.round(Math.min(Math.max(i.mtimeMs + i.offsetMs, lower), upper));
}

/** "−1.8s" for the console line */
export const formatOffset = (offsetMs: number): string => `${offsetMs < 0 ? '−' : '+'}${(Math.abs(offsetMs) / 1000).toFixed(1)}s`;
