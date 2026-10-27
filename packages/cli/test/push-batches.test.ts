import { describe, expect, it } from 'vitest';
import type { PushOp } from '@rodo/protocol';
import { ApiError } from '../src/net/errors';
import type { Http } from '../src/net/http';
import { MAX_BYTES, MAX_OPS, sendBatches, splitBatches, type PlannedOp, type PushEnvelope } from '../src/sync/push';

const planned = (n: number, descLen = 10): PlannedOp[] =>
  Array.from({ length: n }, (_, i) => ({
    op: { opId: `o${i}`, kind: 'UPDATE', cardId: `c${i}`, baseRev: '1', editedAt: 1, rodoPath: `cycles/${i}/card.rodo.md`, formatVersion: 2, fields: { description: 'x'.repeat(descLen) } } as PushOp,
    path: `cycles/${i}/card.rodo.md`,
    id: `c${i}`,
  }));
const env: PushEnvelope = { deviceId: 'd', clientNowMs: 1, clock: 'server', offsetMs: 0, ackSeq: '0' };

describe('splitBatches (R13)', () => {
  it('at most 50 ops per request', () => {
    const b = splitBatches(planned(120));
    expect(b.map((x) => x.length)).toEqual([MAX_OPS, MAX_OPS, 20]);
  });

  it('at most ~900 KB per request', () => {
    const b = splitBatches(planned(10, 200_000)); // ~200 KB each
    expect(b.every((x) => x.length <= 4)).toBe(true);
    for (const batch of b) expect(Buffer.byteLength(JSON.stringify(batch.map((p) => p.op)))).toBeLessThanOrEqual(MAX_BYTES + 1000);
    expect(b.flat()).toHaveLength(10);
  });

  it('an op bigger than the limit travels alone', () => {
    const big = planned(1, MAX_BYTES + 5000);
    const b = splitBatches([...planned(2), ...big, ...planned(2)]);
    expect(b.map((x) => x.length)).toEqual([2, 1, 2]);
  });

  it('keeps the order and loses nothing', () => {
    const ops = planned(77);
    expect(splitBatches(ops).flat().map((p) => p.op.opId)).toEqual(ops.map((p) => p.op.opId));
  });
});

/** A fake server that answers 413 above `limit` ops per request. */
function fakeHttp(limit: number, onlyBigIds: Set<string> = new Set()) {
  const calls: number[] = [];
  const http = {
    opts: {},
    post: async (_path: string, body: { ops: PushOp[] }) => {
      calls.push(body.ops.length);
      if (body.ops.length > limit || body.ops.some((o) => onlyBigIds.has(o.opId) && body.ops.length > 0 && onlyBigIds.has(o.opId))) throw new ApiError(413, 'PUSH_TOO_LARGE', 'too big');
      return { toSeq: '9', serverTimeMs: 5, results: body.ops.map((o) => ({ opId: o.opId, status: 'APPLIED', errors: [] })) };
    },
  } as unknown as Http;
  return { http, calls };
}

describe('sendBatches: a 413 halves the batch (G7)', () => {
  it('halves until the server accepts, and every op gets a result', async () => {
    const { http, calls } = fakeHttp(8);
    const out = await sendBatches(http, 'b1', env, [planned(32)]);
    expect(out.results.size).toBe(32);
    expect(out.tooLarge).toEqual([]);
    expect(calls[0]).toBe(32);
    expect(calls.filter((n) => n <= 8).length).toBeGreaterThanOrEqual(4);
    expect(calls.reduce((n, c) => (c <= 8 ? n + c : n), 0)).toBe(32);
  });

  it('a single op that is too large alone is reported for that card and the others continue', async () => {
    const ops = planned(5);
    const { http } = fakeHttp(100, new Set([ops[2]!.op.opId]));
    const out = await sendBatches(http, 'b1', env, [ops]);
    expect(out.tooLarge.map((p) => p.op.opId)).toEqual(['o2']);
    expect([...out.results.keys()].sort()).toEqual(['o0', 'o1', 'o3', 'o4']);
  });

  it('other errors (409, 401) stop the push and propagate', async () => {
    const http = { opts: {}, post: async () => { throw new ApiError(409, 'REPOSITORY_MISMATCH', 'no'); } } as unknown as Http;
    await expect(sendBatches(http, 'b1', env, [planned(2)])).rejects.toMatchObject({ code: 'REPOSITORY_MISMATCH' });
  });
});
