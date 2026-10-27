import { describe, expect, it } from 'vitest';
import { CODES, SYNC_CODES, serializeCard } from '../src/index';
import { codeFixtures, run, validFixtures } from './fixture-runner';

// a few stable § messages have no CODE: prefix (ref/11 §8)
const PREFIX: Record<string, string> = {
  REF_NOT_FOUND: 'ref not found', REF_MISSING_LOCAL: 'ref not found', HOURS_INVALID: 'invalid hours', CARD_ID_DUPLICATE: 'duplicate id', LOCKED: 'card is locked',
};

describe('R2 one failing fixture per code', () => {
  for (const f of codeFixtures()) {
    it(`${f.code}/${f.name}`, () => {
      const r = run(f);
      const hit = [...r.errors, ...r.warnings].find((x) => x.code === f.code);
      expect(hit, JSON.stringify(r)).toBeDefined();
      const sev = CODES[f.code as keyof typeof CODES].sev;
      expect((sev === 'E' ? r.errors : r.warnings).includes(hit!)).toBe(true);
      expect(hit!.message.startsWith(PREFIX[f.code!] ?? f.code!)).toBe(true);
    });
  }
});

describe('R2 valid fixtures are clean', () => {
  for (const f of validFixtures()) {
    it(f.name, () => {
      const r = run(f);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      const once = serializeCard(r.model!, { original: f.text });
      expect(serializeCard(run({ ...f, text: once }).model!, { original: once })).toBe(once);
    });
  }
});

describe('codes table', () => {
  it('has no overlap with sync-only codes', () => {
    expect(Object.keys(SYNC_CODES).filter((c) => c in CODES)).toEqual([]);
  });
});
