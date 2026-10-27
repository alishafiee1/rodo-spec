import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCard, validateCard, type CardModel, type Finding, type ValidateContext } from '../src/index';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export interface Fixture { code: string | null; name: string; file: string; text: string; ctx: ValidateContext }

/** `<name>.rodo.md` plus optional `<name>.ctx.json` (relPath, boundBoardId, meta, missingFiles, siblingFiles, mapText, knownIds, baseFile). */
function load(dir: string, name: string, code: string | null): Fixture {
  const file = join(dir, `${name}.rodo.md`);
  const cj = join(dir, `${name}.ctx.json`);
  const c = existsSync(cj) ? JSON.parse(readFileSync(cj, 'utf8')) : {};
  const missing: string[] = c.missingFiles ?? [];
  let base: CardModel | null = null;
  if (c.baseFile) base = parseCard(readFileSync(join(dir, c.baseFile), 'utf8')).model;
  return {
    code, name, file, text: readFileSync(file, 'utf8'),
    ctx: {
      relPath: c.relPath ?? 'inbox/x.rodo.md', projectSlug: 'shop', boundBoardId: c.boundBoardId ?? null, base,
      meta: c.meta ?? null, repoFileExists: (p) => !missing.includes(p), siblingFiles: c.siblingFiles ?? [],
      mapText: c.mapText ?? null, knownIds: c.knownIds,
    },
  };
}

const fixtureNames = (dir: string) =>
  readdirSync(dir).filter((f) => f.endsWith('.rodo.md') && !f.endsWith('.base.rodo.md')).map((f) => f.replace(/\.rodo\.md$/, ''));

export function codeFixtures(): Fixture[] {
  const root = join(FIXTURES, 'codes');
  return readdirSync(root).flatMap((code) => fixtureNames(join(root, code)).map((n) => load(join(root, code), n, code)));
}

export function validFixtures(): Fixture[] {
  const dir = join(FIXTURES, 'valid');
  return fixtureNames(dir).map((n) => load(dir, n, null));
}

export const run = (f: Fixture): { errors: Finding[]; warnings: Finding[] } => validateCard(f.text, f.ctx);
