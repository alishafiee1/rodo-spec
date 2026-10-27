import type { Finding } from '@rodo/card-format';
import type { CardFile } from '../core/cards';
import type { Ctx } from '../core/context';
import { discover, selectProjects, type Discovery, type ProjectRef } from '../core/discovery';
import { CliError, notRepo } from '../core/errors';
import { mark } from '../core/output';

export const LEGACY_MSG = 'LEGACY_LAYOUT: run rodo init to move rodo/ into rodo/<project>/';

/** Discovery + project selection. A broken project.json is exit 3 (ref/12 §7.1). */
export function load(ctx: Ctx, defaultToCwd: boolean): { d: Discovery; refs: ProjectRef[] } {
  const d = discover(ctx.cwd);
  const refs = selectProjects(d, ctx.opts.project ?? [], defaultToCwd);
  const broken = refs.find((r) => r.problem);
  if (broken) throw new CliError('PROJECT_INVALID', `rodo/${broken.slug}: ${broken.problem}`, 3);
  if (!refs.length) throw notRepo('no RODO project found: run rodo init --method-only');
  return { d, refs };
}

const fmt = (c: CardFile, f: Finding, icon: string) => `  ${icon} ${c.path}${f.line ? `:${f.line}` : ''}  ${f.message}`;

export function printFindings(ctx: Ctx, cards: CardFile[]): void {
  for (const c of cards) {
    for (const f of c.errors) ctx.out.line(fmt(c, f, mark.err));
    for (const f of c.warnings) ctx.out.line(fmt(c, f, mark.warn));
  }
}

export const sum = (cards: CardFile[]) => ({
  files: cards.length,
  errors: cards.reduce((n, c) => n + c.errors.length, 0),
  warnings: cards.reduce((n, c) => n + c.warnings.length, 0),
});

export const slim = (f: Finding) => ({ code: f.code, line: f.line, message: f.message });
