import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readJson, writeAtomic, writeJson, posix } from '../core/fs-atomic';
import { lsFiles, moveFile } from '../core/git';
import type { ProjectJson } from '../core/project';
import { readKitJson } from './install';

export { isLegacyLayout as detectLegacy } from '../core/discovery';

export interface Move { from: string; to: string }
export interface MigrationPlan {
  slug: string;
  moves: Move[];
  /** `rodo/config.json` -> project.json (content converted) */
  config: { from: string; to: string } | null;
  /** cycle 001 `.rodo.json`: boardId + serverUrl are copied into project.json; the file stays */
  binding: string | null;
  /** `rodo/.kit-version`: superseded by rodo/kit.json, left in place */
  leftInPlace: string[];
}

export interface MigrationResult {
  moved: Move[];
  rewritten: { file: string; links: number }[];
  /** files that mention the old paths and were not rewritten: a human edits them */
  notRewritten: string[];
}

const MOVE_NAMES = ['MAP.md', 'MEMORY.md', 'RULES.md', 'CHANGELOG.md', 'project', 'cycles'];
const OLD_LINK = /(?<![A-Za-z0-9_.\-/])\/rodo\/(?=(?:cycles\/|project\/|MAP\.md|MEMORY\.md|RULES\.md|CHANGELOG\.md))/g;
const OLD_MENTION = /rodo\/(?:cycles|project)\b|rodo\/(?:MAP|MEMORY)\.md/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

/** ref/13 §L steps 1-2. Throws when a target already exists (nothing is overwritten). */
export function planMigration(root: string, slug: string): MigrationPlan {
  const rodo = join(root, 'rodo');
  const moves: Move[] = [];
  for (const n of MOVE_NAMES) {
    if (existsSync(join(rodo, n))) moves.push({ from: `rodo/${n}`, to: `rodo/${slug}/${n}` });
  }
  const config = existsSync(join(rodo, 'config.json')) ? { from: 'rodo/config.json', to: `rodo/${slug}/project.json` } : null;
  for (const m of [...moves, ...(config ? [config] : [])]) {
    if (existsSync(join(root, m.to))) throw new Error(`cannot migrate: ${m.to} already exists`);
  }
  return {
    slug, moves, config,
    binding: existsSync(join(root, '.rodo.json')) ? '.rodo.json' : null,
    leftInPlace: existsSync(join(rodo, '.kit-version')) ? ['rodo/.kit-version'] : [],
  };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(n) && n !== '.rodo') walk(p, out); } else out.push(p);
  }
  return out;
}

export function applyMigration(root: string, plan: MigrationPlan, opts: { name?: string; useGit: boolean }): MigrationResult {
  const rodo = join(root, 'rodo');
  const slug = plan.slug;
  const oldConfig = plan.config ? readJson<Record<string, unknown>>(join(root, plan.config.from)) ?? {} : {};
  const binding = plan.binding ? readJson<{ boardId?: string; serverUrl?: string }>(join(root, plan.binding)) : null;

  const all = plan.config ? [...plan.moves, plan.config] : plan.moves;
  for (const m of all) moveFile(root, join(root, m.from), join(root, m.to), opts.useGit);

  if (plan.config) {
    const lang = (oldConfig.language ?? {}) as { simple?: string; technical?: string };
    const project: ProjectJson = {
      schemaVersion: 2, projectSlug: slug, name: opts.name ?? slug,
      serverUrl: binding?.serverUrl ?? null, boardId: binding?.boardId ?? null, repoFingerprint: null,
      language: { simple: lang.simple === 'en' ? 'en' : 'fa', technical: lang.technical ?? 'en' },
      testCommand: typeof oldConfig.testCommand === 'string' ? oldConfig.testCommand : null,
      stepsDirs: Array.isArray(oldConfig.stepsDirs) ? (oldConfig.stepsDirs as string[]) : [],
    };
    writeJson(join(root, plan.config.to), project);
    const kit = readKitJson(root);
    if (kit && (oldConfig.kitRepo || oldConfig.kitRef)) {
      writeJson(join(rodo, 'kit.json'), { ...kit, ...(oldConfig.kitRepo ? { kitRepo: oldConfig.kitRepo } : {}), ...(oldConfig.kitRef ? { kitRef: oldConfig.kitRef } : {}) });
    }
  }

  const rewritten: MigrationResult['rewritten'] = [];
  const targets = existsSync(join(rodo, slug))
    ? walk(join(rodo, slug)).filter((p) => /\.(md|feature)$/i.test(p))
    : [];
  for (const n of ['AGENTS.md', 'CLAUDE.md']) if (existsSync(join(root, n))) targets.push(join(root, n));
  for (const p of targets) {
    const text = readFileSync(p, 'utf8');
    let n = 0;
    const next = text.replace(OLD_LINK, () => { n++; return `/rodo/${slug}/`; });
    if (n) { writeAtomic(p, next); rewritten.push({ file: posix(relative(root, p)), links: n }); }
  }

  const done = new Set(rewritten.map((r) => r.file));
  const candidates = (opts.useGit ? lsFiles(root, ['.']) : null) ?? walk(root).map((p) => posix(relative(root, p)));
  const notRewritten: string[] = [];
  for (const f of candidates) {
    if (done.has(f) || f.startsWith('.agents/skills/rodo/') || f === 'rodo/kit.json' || f.endsWith('.rodo-new')) continue;
    const abs = join(root, f);
    if (!existsSync(abs) || statSync(abs).size > 1_000_000) continue;
    const text = readFileSync(abs, 'utf8');
    if (!text.includes('\0') && OLD_MENTION.test(text)) notRewritten.push(f);
  }
  return { moved: all, rewritten, notRewritten: notRewritten.sort() };
}
