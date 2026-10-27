import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Ctx } from '../core/context';
import { discover, findRoot } from '../core/discovery';
import { usage } from '../core/errors';
import { isGitRepo } from '../core/git';
import { slugProblem, slugify } from '../core/project';
import { installKit } from '../kit/install';
import { applyMigration, detectLegacy, planMigration } from '../kit/legacy-migrate';
import { connectProject } from './init-connect';
import { addGitignore, missingGitignoreLines, scaffoldProject } from '../kit/project-scaffold';

export interface InitArgs {
  project?: string; name?: string; server?: string; connect?: string; board?: string; createBoard?: boolean;
  methodOnly?: boolean; noKitUpdate?: boolean; dryRun?: boolean; yesFiles?: boolean;
}

/** ref/13 §2 steps 1-6 (+ §L). The server steps arrive with P3b, so every run here is method-only. */
export async function runInit(ctx: Ctx, a: InitArgs): Promise<number> {
  const { out } = ctx;
  const data: Record<string, unknown> = { version: 1 };
  if (a.methodOnly && (a.connect || a.board || a.createBoard)) throw usage('--connect, --board and --create-board need the server; drop --method-only');

  // 1. repo root
  const found = findRoot(ctx.cwd);
  const root = found?.root ?? ctx.cwd;
  if (!found || !isGitRepo(root)) {
    out.line('NO_GIT: no git repository found (repository identity will be unavailable)');
    data.warnings = ['NO_GIT'];
  }

  // 2. kit
  if (!a.noKitUpdate) {
    const r = installKit(root, { dryRun: a.dryRun });
    const jump = r.from && r.from !== r.to ? `${r.from} → ${r.to}` : r.to;
    out.line(`kit ${jump}: ${r.written.length} written, ${r.updated.length} updated, ${r.unchanged.length} unchanged${a.dryRun ? '  (dry run: nothing written)' : ''}`);
    for (const f of r.kept) out.line(`KIT_FILE_KEPT: ${f} (you changed it; compare with ${f}.rodo-new)`);
    for (const f of r.blocks) out.line(`${f}: RODO block ${a.dryRun ? 'would be ' : ''}updated`);
    data.kit = r;
  }

  // 3. legacy layout
  const legacy = detectLegacy(root);
  const existing = discover(root).projects.filter((p) => !p.legacy);

  // 4. which project
  let slug = a.project;
  if (!slug) {
    if (!legacy && existing.length === 1) slug = existing[0]!.slug;
    else if (a.dryRun) slug = slugify(basename(root)); // a dry run never asks (dogfood #5)
    else slug = (await ctx.prompt.ask('Project slug', slugify(basename(root)))).trim();
  }
  const bad = slugProblem(slug);
  if (bad) throw usage(`${bad} (got "${slug}")`);
  data.project = slug;

  if (legacy) {
    const plan = planMigration(root, slug);
    out.line('LEGACY_LAYOUT: kit 2.0 layout found. Plan:');
    for (const m of plan.moves) out.line(`  ${m.from}  →  ${m.to}`);
    if (plan.config) out.line(`  ${plan.config.from}  →  ${plan.config.to}  (keys converted)`);
    if (plan.binding) out.line(`  ${plan.binding}: boardId and serverUrl are copied into project.json (the file stays)`);
    for (const f of plan.leftInPlace) out.line(`  ${f}: stays (superseded by rodo/kit.json, safe to delete later)`);
    out.line('  links /rodo/cycles/…, /rodo/project/…, /rodo/MAP.md, /rodo/MEMORY.md become /rodo/' + slug + '/…');
    data.plan = plan;
    if (!a.dryRun) {
      if (!(await ctx.prompt.confirm('Move the files above?'))) {
        out.line('MIGRATION_CANCELLED: nothing was moved');
        out.flush(data);
        return 0;
      }
      const res = applyMigration(root, plan, { name: a.name, useGit: isGitRepo(root) });
      out.line(`moved ${res.moved.length} item(s); rewrote links in ${res.rewritten.length} file(s); nothing was deleted`);
      if (res.notRewritten.length) {
        out.line('These files mention the old paths and need a manual edit:');
        for (const f of res.notRewritten) out.line(`  ${f}`);
      }
      if (isGitRepo(root)) out.line('Review with: git status    (you commit)');
      data.migration = res;
    }
  }

  // 4b. project folder
  const projectDir = join(root, 'rodo', slug);
  if (a.dryRun) {
    out.line(`project rodo/${slug}/: ${existsSync(join(projectDir, 'project.json')) ? 'exists (missing files would be added)' : 'would be created'}`);
  } else {
    const isNew = !existsSync(join(projectDir, 'project.json'));
    const lang = isNew ? await chooseLanguage(ctx) : 'fa';
    const created = scaffoldProject(root, slug, a.name ?? slug, lang);
    if (isNew) data.language = lang;
    out.line(created.length ? `rodo/${slug}/: created ${created.length} file(s)` : `rodo/${slug}/: nothing to add`);
    data.created = created;
  }

  // 5. .gitignore
  // method-only: card files stay in git (there is no board to hold them); connecting adds the card line
  const gi = { cards: !a.methodOnly };
  const missing = missingGitignoreLines(root, gi);
  let gitignoreDone = !missing.length;
  if (missing.length) {
    if (a.dryRun) out.line(`.gitignore would get: ${missing.join(', ')}`);
    else if (a.yesFiles || (await ctx.prompt.confirm(`Add ${missing.length} RODO line(s) to .gitignore (${missing.join(', ')})?`, true))) {
      addGitignore(root, gi);
      out.line('.gitignore updated');
      gitignoreDone = true;
    } else out.line('.gitignore left alone (local sync state may end up in git)');
  }

  // 6. method-only stop; 7-13 connect, bind and the first sync
  if (!a.methodOnly && !a.dryRun) {
    const code = await connectProject(ctx, root, slug, a, data);
    out.flush(data);
    return code;
  }
  out.line('');
  out.line(nextSteps({ bound: false, gitignore: gitignoreDone }));
  out.flush(data);
  return 0;
}

/** The closing hint (dogfood #6, #7, #21): what to commit and what to do next, in plain words. */
export function nextSteps(o: { bound: boolean; gitignore: boolean }): string {
  const files = `rodo/, .agents/, AGENTS.md, CLAUDE.md${o.gitignore ? ' and .gitignore' : ''}`;
  return [
    o.bound
      ? `Next: commit ${files}. Card files (*.rodo.md) are not committed: they live on the board and arrive with rodo sync.`
      : `Next: commit ${files}. Without a board, card files (*.rodo.md) are committed too; run rodo init (without --method-only) later to connect a board.`,
    'Then ask your AI assistant to read AGENTS.md and plan the first card, or run: rodo new "<title>"',
  ].join('\n');
}

/** The plain-language docs language for a new project: --lang, else ask (default from the system locale), else the locale. */
export async function chooseLanguage(ctx: Ctx, env: NodeJS.ProcessEnv = process.env): Promise<'fa' | 'en'> {
  const flag = ctx.opts.lang;
  if (flag === 'fa' || flag === 'en') return flag;
  const loc = (env.LC_ALL || env.LC_MESSAGES || env.LANG || '').toLowerCase();
  const def = loc.startsWith('fa') ? 'fa' : 'en';
  if (!ctx.prompt.interactive) return def;
  const a = (await ctx.prompt.ask('Language for the plain-language docs (en/fa)', def)).trim().toLowerCase();
  return a === 'fa' ? 'fa' : a === 'en' ? 'en' : def;
}
