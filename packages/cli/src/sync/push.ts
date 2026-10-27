import type { OpResult, PushOp, PushResult, ValidationReport } from '@rodo/protocol';
import { ApiError } from '../net/errors';
import type { Http } from '../net/http';

export const MAX_OPS = 50;
/** headroom under the server limit of 1 048 576 bytes (G7) */
export const MAX_BYTES = 900_000;

export interface PlannedOp {
  op: PushOp;
  /** project-relative file path (for reports) */
  path: string;
  /** card id for UPDATE/ARCHIVE, null for CREATE */
  id: string | null;
  simple?: { hash: string; branch: string | null };
}

const size = (p: PlannedOp) => Buffer.byteLength(JSON.stringify(p.op), 'utf8');

/** Splits ops into requests of at most `maxOps` ops and about `maxBytes` bytes. An op bigger than the byte limit travels alone. */
export function splitBatches(ops: PlannedOp[], maxOps = MAX_OPS, maxBytes = MAX_BYTES): PlannedOp[][] {
  const out: PlannedOp[][] = [];
  let cur: PlannedOp[] = [];
  let bytes = 0;
  for (const p of ops) {
    const s = size(p);
    if (cur.length && (cur.length >= maxOps || bytes + s > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(p);
    bytes += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface PushEnvelope {
  deviceId: string;
  clientNowMs: number;
  clock: 'server' | 'local';
  offsetMs: number;
  ackSeq: string;
}

export interface PushOutcome {
  results: Map<string, OpResult>;
  /** ops that are too big even alone: PUSH_TOO_LARGE for that card, the others continue */
  tooLarge: PlannedOp[];
  toSeq: string | null;
  serverTimeMs: number | null;
}

const is413 = (e: unknown): boolean => e instanceof ApiError && e.status === 413;

/** R13: send the batches; any 413 halves the batch and retries. Request-level errors (409, 401...) propagate. */
export async function sendBatches(http: Http, boardId: string, env: PushEnvelope, batches: PlannedOp[][]): Promise<PushOutcome> {
  const out: PushOutcome = { results: new Map(), tooLarge: [], toSeq: null, serverTimeMs: null };
  const send = async (batch: PlannedOp[]): Promise<void> => {
    try {
      const r = await http.post<PushResult>(`/v1/sync/boards/${boardId}/push`, { ...env, ops: batch.map((p) => p.op), validation: [] });
      for (const res of r.results) out.results.set(res.opId, res);
      out.toSeq = r.toSeq;
      out.serverTimeMs = r.serverTimeMs;
    } catch (e) {
      if (!is413(e)) throw e;
      if (batch.length === 1) {
        out.tooLarge.push(batch[0]!);
        return;
      }
      const mid = Math.ceil(batch.length / 2);
      await send(batch.slice(0, mid));
      await send(batch.slice(mid));
    }
  };
  for (const b of batches) await send(b);
  return out;
}

/** The validation entries (and the ack of the pull) travel in their own request, so they never ride on a batch that gets halved. */
export async function sendValidation(http: Http, boardId: string, env: PushEnvelope, validation: ValidationReport[]): Promise<PushResult> {
  return http.post<PushResult>(`/v1/sync/boards/${boardId}/push`, { ...env, ops: [], validation });
}
