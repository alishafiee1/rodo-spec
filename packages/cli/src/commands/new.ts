import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { scanCards } from '../core/cards';
import type { Ctx } from '../core/context';
import { CliError } from '../core/errors';
import { kitDir } from '../kit/install';
import { load, printFindings, sum } from './shared';

export interface NewOpts { slug?: string; major?: boolean; dryRun?: boolean }

/** ASCII kebab-case; empty when the title has no latin letters or digits (e.g. Persian). */
export function slugify(title: string): string {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-');
}

/** Next free cycle number in rodo/<project>/cycles: highest NNN + 1, three digits. */
export function nextNumber(cyclesDir: string): string {
  const nums = existsSync(cyclesDir)
    ? readdirSync(cyclesDir).map((n) => /^(\d{3,})-/.exec(n)?.[1]).filter(Boolean).map(Number)
    : [];
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

function templatesDir(root: string, lang: 'fa' | 'en'): { dir: string; en: string } {
  const local = join(root, '.agents/skills/rodo/templates');
  const base = existsSync(join(local, 'card.rodo.md')) ? local : join(kitDir(), '.agents/skills/rodo/templates');
  const en = existsSync(join(base, 'en/card.rodo.md')) ? join(base, 'en') : base;
  return { dir: lang === 'en' ? en : base, en };
}

const today = () => new Date().toISOString().slice(0, 10);

/** `rodo new "<title>"`: a new cycle folder from the kit templates in the project's language. Writes only new files. */
export async function runNew(ctx: Ctx, title: string | undefined, o: NewOpts): Promise<number> {
  const t = (title ?? '').trim();
  if (!t) throw new CliError('USAGE', 'usage: rodo new "<title>" [--slug <kebab-slug>] [--major]', 2);
  const { d, refs } = load(ctx, true);
  if (refs.length !== 1 || refs[0]!.legacy) {
    throw new CliError('USAGE', `more than one project: add --project <slug> (${refs.map((r) => r.slug).join(', ')})`, 2);
  }
  const ref = refs[0]!;
  const slug = o.slug ? slugify(o.slug) : slugify(t);
  if (!slug) throw new CliError('USAGE', 'the title has no latin letters for a folder name: add --slug <kebab-slug>, e.g. --slug order-cancel', 2);
  const cycles = join(ref.dir, 'cycles');
  const nnn = nextNumber(cycles);
  const folder = `${nnn}-${slug}`;
  const dir = join(cycles, folder);
  if (existsSync(dir)) throw new CliError('USAGE', `${relative(d.root, dir)} already exists`, 2);

  const lang = ref.project?.language.simple ?? 'fa';
  const { dir: tpl, en } = templatesDir(d.root, lang);
  const fill = (s: string) => s
    .replaceAll('{{NNN-slug}}', folder).replaceAll('{{NNN}}', nnn).replaceAll('{{project}}', ref.slug)
    .replaceAll('{{YYYY-MM-DD}}', today())
    .replace(/\{\{(short title|عنوان کوتاه|title|عنوان|cycle title|عنوان چرخه)\}\}/g, t.replace(/"/g, "'"));
  const read = (name: string) => {
    const p = existsSync(join(tpl, name)) ? join(tpl, name) : join(en, name);
    return existsSync(p) ? readFileSync(p, 'utf8') : existsSync(join(tpl, '..', name)) ? readFileSync(join(tpl, '..', name), 'utf8') : null;
  };

  let card = fill(read('card.rodo.md')!);
  if (o.major) {
    card = card.replace(/^# workflow: standard.*$/m, 'workflow: major')
      .replace(/^<!-- (\[[^\]]+\]\([^)]*acceptance\.feature\)) — [^>]*-->$/m, '- $1');
  }
  const files: [string, string][] = [['card.rodo.md', card], ['simple.md', fill(read('simple.md')!)], ['spec.md', fill(read('spec.md')!)]];
  if (o.major) files.push(['design.md', fill(read('design.md')!)], ['acceptance.feature', fill(read('acceptance.feature')!)]);

  const rel = relative(d.root, dir).split(sep).join('/');
  if (!o.dryRun) {
    mkdirSync(dir, { recursive: true });
    for (const [n, body] of files) writeFileSync(join(dir, n), body);
  }
  ctx.out.line(`${o.dryRun ? 'would create' : 'created'} ${rel}/`);
  for (const [n] of files) ctx.out.line(`  ${n}`);
  let errors = 0;
  if (!o.dryRun) {
    const cards = scanCards(d.root, ref, [join(dir, 'card.rodo.md')]);
    errors = sum(cards).errors;
    printFindings(ctx, cards);
    ctx.out.line('Next: fill in the {{…}} parts of card.rodo.md and simple.md (or ask your AI), add the cycle to MAP.md, then rodo validate.');
  }
  ctx.out.flush({ version: 2, project: ref.slug, folder: rel, number: nnn, files: files.map(([n]) => `${rel}/${n}`), dryRun: !!o.dryRun, errors });
  return 0;
}
