import { resolve } from 'node:path';
import { scanCards } from '../core/cards';
import type { Ctx } from '../core/context';
import { LEGACY_MSG, load, printFindings, slim, sum } from './shared';

/** R4: same findings as the card-format validator; writes nothing. Exit 0 whenever it ran; with --strict exit 1 when there are errors (for CI and hooks). */
export async function runValidate(ctx: Ctx, paths: string[], o: { strict?: boolean } = {}): Promise<number> {
  const { d, refs } = load(ctx, false);
  const only = paths.map((p) => resolve(ctx.cwd, p));
  const files: unknown[] = [];
  const total = { files: 0, errors: 0, warnings: 0 };
  for (const ref of refs) {
    const cards = scanCards(d.root, ref, only);
    const s = sum(cards);
    total.files += s.files; total.errors += s.errors; total.warnings += s.warnings;
    if (ref.legacy) ctx.out.line(LEGACY_MSG);
    ctx.out.line(`rodo/${ref.legacy ? '' : ref.slug}  ▸ ${s.files} files · errors ${s.errors} · warnings ${s.warnings}`);
    printFindings(ctx, cards);
    for (const c of cards) files.push({ project: ref.slug, path: c.path, errors: c.errors.map(slim), warnings: c.warnings.map(slim) });
  }
  ctx.out.flush({ version: 2, files, summary: total });
  return o.strict && total.errors > 0 ? 1 : 0;
}
