import { normalizeForCompare } from './compare';
import type { CardModel } from './model';

// purpose --- pure sha256 so the library needs no node:crypto (R1: runs in the browser too) ---
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string): string {
  const data = new TextEncoder().encode(input);
  const len = data.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const at = (arr: Uint32Array, i: number): number => arr[i] as number; // typed arrays are never sparse
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(at(w, i - 15), 7) ^ rotr(at(w, i - 15), 18) ^ (at(w, i - 15) >>> 3);
      const s1 = rotr(at(w, i - 2), 17) ^ rotr(at(w, i - 2), 19) ^ (at(w, i - 2) >>> 10);
      w[i] = (at(w, i - 16) + s0 + at(w, i - 7) + s1) >>> 0;
    }
    let a = at(h, 0), b = at(h, 1), c = at(h, 2), d = at(h, 3), e = at(h, 4), f = at(h, 5), g = at(h, 6), hh = at(h, 7);
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + at(K, i) + at(w, i)) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = at(h, 0) + a; h[1] = at(h, 1) + b; h[2] = at(h, 2) + c; h[3] = at(h, 3) + d;
    h[4] = at(h, 4) + e; h[5] = at(h, 5) + f; h[6] = at(h, 6) + g; h[7] = at(h, 7) + hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** Hash of every synced field (not workflow, extras, updatedAt, locked), compared with normalizeForCompare. */
export function canonicalHash(m: CardModel): string {
  const n = normalizeForCompare;
  const body = {
    title: n('title', m.title),
    description: n('description', m.description),
    status: n('status', { status: m.status, list: m.list ?? null, statusReason: m.statusReason, blockerType: m.blockerType }),
    priority: m.priority, coverColor: m.coverColor,
    startAt: n('startAt', m.startAt), dueAt: n('dueAt', m.dueAt),
    hours: n('hours', m.hoursMinutes),
    financial: n('financial', m.financial), scope: n('scope', m.scope), test: n('test', m.test),
    members: n('members', m.members), labels: n('labels', m.labels),
    refs: m.refs.map((r) => ({ id: r.id ?? null, title: n('title', r.title), path: r.path })),
    decisions: m.decisions.map((d) => ({
      id: d.id ?? null, question: n('text', d.question),
      options: d.options.map((o) => ({ key: o.key, text: n('text', o.text) })), answer: d.answer,
    })),
    checklists: m.checklists.map((c) => ({
      id: c.id ?? null, title: n('title', c.title),
      items: c.items.map((i) => ({ id: i.id ?? null, title: n('title', i.title), isDone: i.isDone, assignee: i.assignee, minutes: i.minutes, kind: i.kind })),
    })),
  };
  return `sha256:${sha256Hex(stableStringify(body))}`;
}
