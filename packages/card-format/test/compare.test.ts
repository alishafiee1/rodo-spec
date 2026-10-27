import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fieldEquals, normalizeForCompare } from '../src/index';
import { here } from './helpers';
import { codeFixtures, FIXTURES, run, validFixtures, type Fixture } from './fixture-runner';
import { join } from 'node:path';

// the backend reads the same files in P2c
const dir = here('./fixtures/compare/');
describe('R11 shared compare fixtures', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const pairs = JSON.parse(readFileSync(dir + file, 'utf8')) as { note: string; field: string; a: unknown; b: unknown; equal: boolean }[];
    for (const p of pairs) {
      it(`${file}: ${p.note}`, () => {
        expect(fieldEquals(p.field, p.a, p.b)).toBe(p.equal);
        expect(fieldEquals(p.field, p.b, p.a)).toBe(p.equal);
      });
    }
  }
  it('normalization is idempotent', () => {
    const v = normalizeForCompare('description', ' a \r\nb ');
    expect(normalizeForCompare('description', v)).toEqual(v);
  });
});

describe('kit fixtures', () => {
  for (const kind of ['kit-v1', 'kit-v2']) {
    for (const f of readdirSync(join(FIXTURES, kind))) {
      it(`${kind}/${f} has no error`, () => {
        const fx: Fixture = {
          code: null, name: f, file: f, text: readFileSync(join(FIXTURES, kind, f), 'utf8'),
          ctx: { relPath: `cycles/${f.replace('.rodo.md', '')}/card.rodo.md`, projectSlug: 'shop', boundBoardId: null, base: null, meta: null, repoFileExists: () => true, siblingFiles: ['simple.md', 'spec.md'], mapText: null },
        };
        const r = run(fx);
        expect(r.errors).toEqual([]);
        const w = r.warnings.map((x) => x.code);
        expect(w.includes('SCHEMA_V1')).toBe(kind === 'kit-v1');
      });
    }
  }
  it('fixture loaders see files', () => {
    expect(codeFixtures().length).toBeGreaterThan(80);
    expect(validFixtures().length).toBeGreaterThan(2);
  });
});
