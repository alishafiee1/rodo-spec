import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from '../core/fs-atomic';
import { loadKit } from './install';

/** ref/13 §1 `.gitignore` block. */
export const GITIGNORE_LINES = ['rodo/*/.rodo/', 'rodo/*/inbox/', 'rodo/**/*.rodo.md'];
/** The card line: only once the project is bound to a board. Without a board the cards live in git (dogfood #7). */
export const CARDS_LINE = 'rodo/**/*.rodo.md';
const GITIGNORE_HEADER = '# RODO: local state (and, once a board is bound, card files: they live on the board)';
const OLD_HEADER = '# RODO: local state and card files (cards live on the RODO board)';

/** ref/13 §2 step 4: only missing files; project-owned files are never overwritten (R2). Returns the paths it created. */
export function scaffoldProject(root: string, slug: string, name: string, lang: 'fa' | 'en'): string[] {
  const kit = loadKit();
  const template = lang === 'en' && kit.manifest.projectTemplateEn?.length ? kit.manifest.projectTemplateEn : kit.manifest.projectTemplate;
  const dir = join(root, 'rodo', slug);
  const created: string[] = [];
  for (const f of template) {
    const dest = join(dir, f.dest);
    if (existsSync(dest)) continue;
    let text = kit.read(f.src).toString('utf8').replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10)).replaceAll('{{slug}}', slug).replaceAll('{{name}}', name).replaceAll('{{نام پروژه}}', name);
    if (f.dest === 'project.json' && lang === 'en') text = text.replace('"simple": "fa"', '"simple": "en"');
    writeAtomic(dest, text);
    created.push(`rodo/${slug}/${f.dest}`);
  }
  mkdirSync(join(dir, 'cycles'), { recursive: true });
  return created;
}

/** `cards: false` (method-only, no board yet) leaves card files to git. */
export function missingGitignoreLines(root: string, opts: { cards?: boolean } = {}): string[] {
  const p = join(root, '.gitignore');
  const have = new Set((existsSync(p) ? readFileSync(p, 'utf8') : '').split(/\r?\n/).map((l) => l.trim()));
  return GITIGNORE_LINES.filter((l) => !have.has(l) && (opts.cards !== false || l !== CARDS_LINE));
}

export function addGitignore(root: string, opts: { cards?: boolean } = {}): void {
  const missing = missingGitignoreLines(root, opts);
  if (!missing.length) return;
  const p = join(root, '.gitignore');
  const cur = existsSync(p) ? readFileSync(p, 'utf8') : '';
  const eol = cur.includes('\r\n') ? '\r\n' : '\n';
  const head = cur && !cur.endsWith('\n') ? eol : '';
  const hasHeader = cur.includes(GITIGNORE_HEADER) || cur.includes(OLD_HEADER);
  const add = [...(hasHeader ? [] : [GITIGNORE_HEADER]), ...missing].join(eol) + eol;
  writeAtomic(p, cur + head + (cur ? eol : '') + add);
}
