import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scanCards } from '../core/cards';
import type { Ctx } from '../core/context';
import { mark } from '../core/output';
import { LEGACY_MSG, load, printFindings, slim, sum } from './shared';

/** Word limits of the two plain project docs (about one and two pages); project-docs.md in the kit. */
const PROJECT_DOC_LIMITS = { 'project/project-overview.md': 500, 'project/how-it-works.md': 900 } as const;

const wordCount = (text: string): number => text.replace(/<!--[\s\S]*?-->/g, ' ').split(/\s+/).filter(Boolean).length;

/** A warning for each plain project doc past its limit. A missing file is fine: old projects keep working. */
function longProjectDocs(dir: string): { path: string; code: string; line: null; message: string }[] {
  return Object.entries(PROJECT_DOC_LIMITS).flatMap(([path, limit]) => {
    const abs = join(dir, path);
    if (!existsSync(abs)) return [];
    const words = wordCount(readFileSync(abs, 'utf8'));
    return words > limit ? [{ path, code: 'PROJECT_DOC_TOO_LONG', line: null, message: `PROJECT_DOC_TOO_LONG: ${words} words, the limit is ${limit}; shorten it` }] : [];
  });
}

/** R4: same findings as the card-format validator; writes nothing. Exit 0 whenever it ran; with --strict exit 1 when there are errors (for CI and hooks). */
export async function runValidate(ctx: Ctx, paths: string[], o: { strict?: boolean } = {}): Promise<number> {
  const { d, refs } = load(ctx, false);
  const only = paths.map((p) => resolve(ctx.cwd, p));
  const files: unknown[] = [];
  const total = { files: 0, errors: 0, warnings: 0 };
  for (const ref of refs) {
    const cards = scanCards(d.root, ref, only);
    const s = sum(cards);
    const docs = only.length || ref.legacy ? [] : longProjectDocs(ref.dir);
    s.warnings += docs.length;
    total.files += s.files; total.errors += s.errors; total.warnings += s.warnings;
    if (ref.legacy) ctx.out.line(LEGACY_MSG);
    ctx.out.line(`rodo/${ref.legacy ? '' : ref.slug}  ▸ ${s.files} files · errors ${s.errors} · warnings ${s.warnings}`);
    printFindings(ctx, cards);
    for (const c of cards) files.push({ project: ref.slug, path: c.path, errors: c.errors.map(slim), warnings: c.warnings.map(slim) });
    for (const f of docs) {
      ctx.out.line(`  ${mark.warn} ${f.path}  ${f.message}`);
      files.push({ project: ref.slug, path: f.path, errors: [], warnings: [{ code: f.code, line: f.line, message: f.message }] });
    }
  }
  ctx.out.flush({ version: 2, files, summary: total });
  return o.strict && total.errors > 0 ? 1 : 0;
}
