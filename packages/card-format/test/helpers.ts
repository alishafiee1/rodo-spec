import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateCard, parseCard, type CardModel, type ValidateContext } from '../src/index';

export const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const read = (p: string) => readFileSync(here(p), 'utf8');

export const ctx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  relPath: 'inbox/x.rodo.md', projectSlug: 'shop', boundBoardId: null, base: null, meta: null,
  repoFileExists: () => true, siblingFiles: [], mapText: null, ...over,
});

export const validate = (text: string, over: Partial<ValidateContext> = {}) => validateCard(text, ctx(over));
export const codes = (r: { errors: { code: string }[]; warnings: { code: string }[] }) =>
  [...r.errors, ...r.warnings].map((f) => f.code);
export const model = (text: string): CardModel => parseCard(text).model!;

/** minimal valid v2 card text */
export const card = (fm = '', body = ''): string =>
  `---\nschemaVersion: 2\ntitle: "T"\nstatus: todo\n${fm}---\n${body ? `\n${body}\n` : ''}`;
