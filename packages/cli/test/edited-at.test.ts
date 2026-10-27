import { describe, expect, it } from 'vitest';
import { computeOffset, editedAt, formatOffset } from '../src/sync/clock';

// G1, ref/12 §5.1: editedAt = clamp(file mtime + offset, lastSyncAt of the card, now + offset)
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

describe('editedAt (R12)', () => {
  it('an ordinary save between the last sync and now is used as it is', () => {
    expect(editedAt({ mtimeMs: NOW - 5 * 60_000, offsetMs: 0, lastSyncAt: NOW - HOUR, nowMs: NOW })).toBe(NOW - 5 * 60_000);
  });

  it('a save two hours ago, with the last sync an hour ago, is raised to the last sync', () => {
    expect(editedAt({ mtimeMs: NOW - 2 * HOUR, offsetMs: 0, lastSyncAt: NOW - HOUR, nowMs: NOW })).toBe(NOW - HOUR);
  });

  it('an mtime in the future is capped at now', () => {
    expect(editedAt({ mtimeMs: NOW + 24 * HOUR, offsetMs: 0, lastSyncAt: NOW - HOUR, nowMs: NOW })).toBe(NOW);
  });

  it('the server offset moves the time and both bounds', () => {
    expect(editedAt({ mtimeMs: NOW - 60_000, offsetMs: 1500, lastSyncAt: 0, nowMs: NOW })).toBe(NOW - 60_000 + 1500);
    expect(editedAt({ mtimeMs: NOW + HOUR, offsetMs: -2000, lastSyncAt: 0, nowMs: NOW })).toBe(NOW - 2000);
  });

  it('a card never synced has no lower bound', () => {
    expect(editedAt({ mtimeMs: 5, offsetMs: 0, lastSyncAt: 0, nowMs: NOW })).toBe(5);
  });

  it('a last sync later than now (clock skew) cannot push the edit into the future', () => {
    expect(editedAt({ mtimeMs: NOW - 1000, offsetMs: 0, lastSyncAt: NOW + HOUR, nowMs: NOW })).toBe(NOW);
  });
});

describe('clock offset', () => {
  it('offset = serverTime + rtt/2 - localNowAfter', () => {
    // sent at 1000, answer at 1200 (rtt 200); the server said 51100 -> the server is 50000 ms ahead
    expect(computeOffset(1000, 1200, 51_100)).toBe(49_900 + 100);
    expect(computeOffset(1000, 1000, 1000)).toBe(0);
  });
  it('is printed with a sign and one decimal', () => {
    expect(formatOffset(-1840)).toBe('−1.8s');
    expect(formatOffset(0)).toBe('+0.0s');
    expect(formatOffset(300)).toBe('+0.3s');
  });
});
