import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';
import type { Ctx, Prompter } from '../../src/core/context';
import { scriptedPrompter } from '../../src/core/context';
import { Out, type GlobalOpts } from '../../src/core/output';

const here = dirname(fileURLToPath(import.meta.url));
export const KIT20 = join(here, '../../../rodo-kit/fixtures/kit-2.0.0');
export const KIT = join(here, '../../../rodo-kit');

const made: string[] = [];
afterAll(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });

export interface Repo {
  root: string;
  git(...args: string[]): string;
  write(rel: string, text: string): void;
  read(rel: string): string;
  exists(rel: string): boolean;
  commit(msg?: string): void;
}

/** A temp git repo with an initial commit. `git: false` gives a plain folder. */
export function tempRepo(opts: { git?: boolean } = {}): Repo {
  const root = mkdtempSync(join(tmpdir(), 'rodo-cli-'));
  made.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8' });
  const repo: Repo = {
    root, git,
    write(rel, text) { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); },
    read: (rel) => readFileSync(join(root, rel), 'utf8'),
    exists: (rel) => existsSync(join(root, rel)),
    commit(msg = 'x') { git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', msg); },
  };
  if (opts.git !== false) {
    git('init', '-q', '-b', 'main');
    // unique text: two repos made in the same second must not share a root commit
    repo.write('README.md', `# t ${Math.random()}\n`);
    repo.commit('init');
  }
  return repo;
}

/** Every file under root (not .git) with its text: to prove a command wrote nothing, or deleted nothing. */
export function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel = '') => {
    for (const n of readdirSync(d)) {
      if (n === '.git') continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`);
      else out[`${rel}${n}`] = readFileSync(p, 'utf8');
    }
  };
  walk(root);
  return out;
}

export interface Ran { code: number; stdout: string; ctx: Ctx; json: <T = any>() => T }

/** Runs a command function against a repo with captured output. */
export async function exec(
  repo: Repo | string,
  fn: (ctx: Ctx) => Promise<number>,
  o: Partial<GlobalOpts> & { answers?: string[]; cwd?: string; prompt?: Prompter } = {},
): Promise<Ran> {
  const root = typeof repo === 'string' ? repo : repo.root;
  let stdout = '';
  const opts: GlobalOpts = { json: o.json, project: o.project ?? [], lang: o.lang };
  const ctx: Ctx = { cwd: o.cwd ?? root, opts, out: new Out(opts, (s) => { stdout += s; }), prompt: o.prompt ?? scriptedPrompter(o.answers ?? []) };
  const code = await fn(ctx);
  return { code, stdout, ctx, json: () => JSON.parse(stdout) };
}

/** A valid in_progress cycle card; override pieces as needed. */
export function cardText(o: { title?: string; status?: string; extraFm?: string; body?: string; slug?: string; folder?: string } = {}): string {
  const slug = o.slug ?? 'shop';
  const folder = o.folder ?? '004-order-cancel';
  return [
    '---', 'schemaVersion: 2', `title: ${o.title ?? 'Order cancel'}`, `status: ${o.status ?? 'in_progress'}`, ...(o.extraFm ? [o.extraFm] : []), '---', '',
    o.body ?? 'The user cancels an unpaid order.\n\n## Progress notes\n\n- Updated: 2026-10-07\n- Done: API\n- Remaining: button',
    '', '## Refs', '', `- [simple](/rodo/${slug}/cycles/${folder}/simple.md)`, '',
  ].join('\n');
}

/** Installs the kit and a project folder through the real init command's pieces. */
export async function initProject(repo: Repo, slug = 'shop'): Promise<void> {
  const { runInit } = await import('../../src/commands/init');
  await exec(repo, (ctx) => runInit(ctx, { project: slug, methodOnly: true, yesFiles: true }), { lang: 'fa' });
}

/** A cycle folder with a card and the files the method hints expect. */
export function addCycle(repo: Repo, slug: string, folder: string, card: string, extra: Record<string, string> = {}): string {
  const base = `rodo/${slug}/cycles/${folder}`;
  repo.write(`${base}/card.rodo.md`, card);
  repo.write(`${base}/simple.md`, '# simple\n');
  for (const [n, t] of Object.entries(extra)) repo.write(`${base}/${n}`, t);
  return `${base}/card.rodo.md`;
}

/** A kit 2.0 repo: rodo/MAP.md, one cycle linking /rodo/cycles/…, a config, the 2.0 AGENTS.md. */
export function legacyRepo(): Repo {
  const repo = tempRepo();
  repo.write('rodo/MAP.md', '# Map\n\n## انجام‌شده\n\n- [x](/rodo/cycles/001-x/simple.md)\n');
  repo.write('rodo/MEMORY.md', '# Memory\n\n- a decision\n');
  repo.write('rodo/RULES.md', '# Rules\n');
  repo.write('rodo/CHANGELOG.md', '# Changelog\n');
  repo.write('rodo/project/brief.md', '# Brief\n');
  repo.write('rodo/config.json', JSON.stringify({ language: { simple: 'fa', technical: 'en' }, stepsDirs: ['e2e/steps'], testCommand: 'npx playwright test --grep @cycle-{NNN}', kitRepo: 'https://example.com/kit.git', kitRef: 'main' }));
  repo.write('rodo/.kit-version', '2.0.0\n');
  repo.write('rodo/cycles/001-x/card.rodo.md', cardText({ title: 'Legacy card', status: 'todo', slug: 'shop', folder: '001-x' }).replace('/rodo/shop/cycles', '/rodo/cycles'));
  repo.write('rodo/cycles/001-x/simple.md', 'See [spec](/rodo/cycles/001-x/spec.md)\n');
  repo.write('rodo/cycles/001-x/spec.md', '# spec\n');
  repo.write('rodo/cycles/001-x/acceptance.feature', '# see /rodo/cycles/001-x/spec.md\nFeature: x\n');
  repo.write('frontend/playwright.config.ts', "export default { features: 'rodo/cycles/**/*.feature' };\n");
  cpSync(join(KIT20, 'AGENTS.md'), join(repo.root, 'AGENTS.md'));
  cpSync(join(KIT20, 'CLAUDE.md'), join(repo.root, 'CLAUDE.md'));
  repo.commit('legacy kit 2.0');
  return repo;
}
