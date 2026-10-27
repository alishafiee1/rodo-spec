import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanSecrets } from '@rodo/card-format';
import { scanCards } from '../core/cards';
import type { Ctx } from '../core/context';
import { discover, type Discovery, type ProjectRef } from '../core/discovery';
import { posix, readJson } from '../core/fs-atomic';
import { credentialsTooOpen } from '../auth/credentials-file';
import { apiHttp } from '../auth/login';
import { getToken } from '../auth/token-store';
import { ApiError } from '../net/errors';
import { CLI_VERSION } from './version';
import { defaultServer } from './server';
import type { MetaResponse } from '@rodo/protocol';
import { isGitRepo, lsFiles, repoFingerprint } from '../core/git';
import { loadKit, readKitJson } from '../kit/install';
import { missingGitignoreLines } from '../kit/project-scaffold';
import type { LastSync } from '../sync/offline';

export type Level = 'OK' | 'WARN' | 'FAIL' | 'INFO' | 'SKIP';
export interface Check { id: string; project: string | null; level: Level; message: string; fix?: string }

const verCmp = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== '.rodo' && n !== 'node_modules') walk(p, out); } else out.push(p);
  }
  return out;
}

const gitHooksPath = (root: string): string | null => {
  try { return execFileSync('git', ['config', 'core.hooksPath'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; }
};
const hasGit = (): boolean => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};

/** Files whose text is scanned for secrets: project docs, simple.md and the cards (ref/13 §5 "secrets"). */
function secretTargets(ref: ProjectRef): string[] {
  const docs = ['MAP.md', 'MEMORY.md'].map((f) => join(ref.dir, f));
  const all = [...docs, ...walk(join(ref.dir, 'project')), ...walk(ref.dir).filter((p) => /[\\/]simple\.md$|\.rodo\.md$/i.test(p))];
  return [...new Set(all)].filter((p) => existsSync(p));
}

export function localChecks(d: Discovery): Check[] {
  const out: Check[] = [];
  const add = (id: string, project: string | null, level: Level, message: string, fix?: string) => out.push({ id, project, level, message, fix });
  const { root } = d;

  const major = Number(process.versions.node.split('.')[0]);
  major >= 20 ? add('node', null, 'OK', `Node ${process.versions.node}`) : add('node', null, 'FAIL', `Node ${process.versions.node} is too old`, 'install Node 20 or newer');
  if (!hasGit()) add('git', null, 'WARN', 'git is not installed', 'install git; RODO works without it but cannot tell repositories apart');
  else if (!isGitRepo(root)) add('git', null, 'WARN', 'this folder is not a git repository', 'run git init');
  else add('git', null, 'OK', 'git repository');

  if (d.legacy) add('layout', null, 'WARN', 'kit 2.0 layout (rodo/MAP.md directly under rodo/)', 'run rodo init to move rodo/ into rodo/<project>/');
  for (const p of d.projects.filter((x) => !x.legacy)) {
    p.problem ? add('layout', p.slug, 'FAIL', `project.json: ${p.problem}`, 'fix rodo/' + p.slug + '/project.json') : add('layout', p.slug, 'OK', 'project.json valid');
  }

  const kit = readKitJson(root);
  if (!kit) add('kit', null, 'WARN', 'rodo/kit.json is missing', 'run rodo init --method-only');
  else {
    const bundled = loadKit().manifest.version;
    if (verCmp(kit.kitVersion, bundled) < 0) add('kit', null, 'WARN', `kit ${kit.kitVersion} is older than the bundled kit ${bundled}`, 'rodo init updates it');
    else add('kit', null, 'OK', `kit ${kit.kitVersion}`);
  }
  const kept = walk(join(root, '.agents')).filter((p) => p.endsWith('.rodo-new'));
  if (kept.length) add('kit-files', null, 'WARN', `${kept.length} kit file(s) changed locally (*.rodo-new present)`, 'compare each file with its .rodo-new copy, then delete the .rodo-new file');

  // card files belong in git until a board is bound (dogfood #7)
  const bound = discover(root).projects.some((p) => !!p.project?.boardId);
  const missing = missingGitignoreLines(root, { cards: bound });
  missing.length ? add('gitignore', null, 'WARN', `.gitignore lacks: ${missing.join(', ')}`, bound ? 'run rodo init --yes-files' : 'run rodo init --method-only --yes-files') : add('gitignore', null, 'OK', '.gitignore has the RODO lines');
  const tracked = lsFiles(root, ['rodo'])?.filter((f) => /\.rodo\.md$/i.test(f));
  if (bound && tracked?.length) add('gitignore', null, 'WARN', `${tracked.length} card file(s) are tracked by git`, 'git rm --cached <file>; cards live on the board, not in git');

  const old: string[] = [];
  if (existsSync(join(root, '.githooks'))) old.push('.githooks/');
  if (gitHooksPath(root)) old.push('core.hooksPath');
  if (existsSync(join(root, 'scripts', 'rodo-lint.cjs'))) old.push('scripts/rodo-lint.cjs');
  if (old.length) add('legacy-kit-1', null, 'WARN', `kit 1.x leftovers: ${old.join(', ')}`, 'see rodo MIGRATION.md in the kit');
  const superseded = ['scripts/rodo-install.cjs', 'scripts/rodo-update.cjs', 'scripts/lib/core.cjs'].filter((f) => existsSync(join(root, f)));
  if (superseded.length) add('legacy-kit-2', null, 'INFO', `superseded by rodo init, safe to delete: ${superseded.join(', ')}`);

  // logged in but no board bound yet: say so instead of "not connected" (dogfood #14)
  const tok = getToken(defaultServer());
  tok ? add('credentials', null, 'OK', `logged in on ${defaultServer()}; no board bound yet`, 'run rodo init to bind a board') : add('credentials', null, 'SKIP', 'not connected');
  add('server', null, 'SKIP', 'not connected');
  add('token', null, 'SKIP', 'not connected');
  add('clock', null, 'SKIP', 'not connected');

  for (const ref of d.projects) {
    const slug = ref.slug;
    const pj = ref.project;
    if (pj?.repoFingerprint) {
      const fp = repoFingerprint(root);
      if (fp && fp !== pj.repoFingerprint) add('repository', slug, 'FAIL', 'REPOSITORY_MISMATCH: this repository is not the one the project was bound to', 'run rodo from the original repository, or reset the binding on the web');
      else add('repository', slug, 'OK', 'repository identity matches');
    } else add('repository', slug, 'SKIP', 'not connected');
    pj?.boardId ? add('binding', slug, 'OK', `bound to board ${pj.boardId}`) : add('binding', slug, 'SKIP', 'not connected (no board bound)');

    const conflicts = walk(join(ref.dir, '.rodo', 'conflicts'));
    const last = readJson<LastSync>(join(ref.dir, '.rodo', 'last-sync.json'));
    const newer = conflicts.filter((p) => !last || statSync(p).mtimeMs > last.finishedAt);
    if (newer.length) add('sync-drift', slug, 'WARN', `${newer.length} conflict file(s) in .rodo/conflicts newer than the last sync`, 'open them, decide, then run rodo sync');

    const cards = scanCards(root, ref);
    const errs = cards.reduce((n, c) => n + c.errors.length, 0);
    const warns = cards.reduce((n, c) => n + c.warnings.length, 0);
    errs ? add('cards', slug, 'WARN', `${cards.length} card(s), ${errs} error(s), ${warns} warning(s)`, 'run rodo validate and fix the errors') : add('cards', slug, 'OK', `${cards.length} card(s), no errors, ${warns} warning(s)`);

    let secrets = 0;
    for (const p of secretTargets(ref)) {
      for (const h of scanSecrets(readFileSync(p, 'utf8'))) {
        if (h.possible) continue;
        secrets++;
        add('secrets', slug, 'FAIL', `${posix(relative(root, p))}:${h.line} looks like a secret (${h.kind})`, 'remove it, rotate it, and refer to it by name only');
      }
    }
    if (!secrets) add('secrets', slug, 'OK', 'no secrets found');

    pj && !pj.testCommand ? add('testCommand', slug, 'INFO', 'no testCommand (tests are optional)') : pj && add('testCommand', slug, 'OK', 'testCommand set');
  }
  return out;
}

/** The server rows of ref/13 §5. They replace the SKIP lines only when a project is bound to a server. */
export async function serverChecks(d: Discovery, checks: Check[]): Promise<Check[]> {
  const bound = d.projects.filter((p) => !p.legacy && p.project?.serverUrl && p.project.boardId);
  if (!bound.length) return checks;
  const server = bound[0]!.project!.serverUrl!;
  const out = [...checks];
  const set = (c: Check) => {
    // replaces the local row (SKIP, or OK for the repository) of the same check; a local FAIL stays
    const i = out.findIndex((x) => x.id === c.id && x.project === c.project && x.level !== 'FAIL');
    if (i >= 0) out[i] = c;
    else out.push(c);
  };
  const tok = getToken(server);
  if (!tok) set({ id: 'credentials', project: null, level: 'WARN', message: 'no token for this server', fix: 'run rodo login' });
  else if (credentialsTooOpen()) set({ id: 'credentials', project: null, level: 'FAIL', message: '~/.rodo/credentials can be read by other users', fix: 'chmod 600 ~/.rodo/credentials' });
  else set({ id: 'credentials', project: null, level: 'OK', message: process.env.RODO_TOKEN ? 'token from RODO_TOKEN' : 'token in the credentials file' });

  let api: Awaited<ReturnType<typeof apiHttp>>;
  try {
    api = await apiHttp(server, tok?.token ?? null, CLI_VERSION);
    await api.http.get('/v1/sync/time');
    set({ id: 'server', project: null, level: 'OK', message: `${server} answers` });
  } catch {
    set({ id: 'server', project: null, level: 'WARN', message: `${server} cannot be reached (offline?)`, fix: 'check the network; rodo keeps working offline' });
    for (const id of ['token', 'clock']) set({ id, project: null, level: 'SKIP', message: 'server unreachable' });
    return out;
  }
  if (!tok) {
    for (const id of ['token', 'clock']) set({ id, project: null, level: 'SKIP', message: 'not logged in' });
    return out;
  }
  try {
    const me = await api.http.get<{ expiresAt: string | null }>('/v1/devices/me');
    const days = me.expiresAt ? (Date.parse(me.expiresAt) - Date.now()) / 86_400_000 : 999;
    set(days < 14 ? { id: 'token', project: null, level: 'WARN', message: `token expires in ${Math.floor(days)} days`, fix: 'run rodo login --rotate' } : { id: 'token', project: null, level: 'OK', message: 'token accepted' });
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'ERROR';
    set({ id: 'token', project: null, level: 'FAIL', message: `${code}: the server does not accept this token`, fix: code === 'CLI_TOO_OLD' ? 'update the rodo CLI' : 'run rodo login' });
    return out;
  }
  const t0 = Date.now();
  const time = await api.http.get<{ serverTimeMs: number }>('/v1/sync/time');
  const offset = time.serverTimeMs + (Date.now() - t0) / 2 - Date.now();
  set(Math.abs(offset) > 300_000 ? { id: 'clock', project: null, level: 'WARN', message: `your computer clock is off by ${Math.round(offset / 60_000)} min`, fix: 'fix the system time' } : { id: 'clock', project: null, level: 'OK', message: 'clock agrees with the server' });

  for (const p of bound) {
    const slug = p.slug;
    try {
      const meta = await api.http.get<MetaResponse>(`/v1/sync/boards/${p.project!.boardId}/meta`);
      const boards = await api.http.get<{ id: string; canWrite: boolean }[]>('/v1/sync/boards');
      const mine = boards.find((b) => b.id === p.project!.boardId);
      set(mine && !mine.canWrite ? { id: 'binding', project: slug, level: 'WARN', message: 'you can read this board but not write', fix: 'ask a board admin for write access' } : { id: 'binding', project: slug, level: 'OK', message: `bound to board "${meta.board.title}"` });
      const fp = repoFingerprint(d.root);
      if (fp && meta.board.repoFingerprint && fp !== meta.board.repoFingerprint) {
        set({ id: 'repository', project: slug, level: 'FAIL', message: 'REPOSITORY_MISMATCH: this repository is not the one the board was bound to', fix: 'run rodo from the original repository' });
      } else set({ id: 'repository', project: slug, level: 'OK', message: 'repository identity matches the board' });
    } catch (e) {
      const gone = e instanceof ApiError && (e.code === 'BOARD_ARCHIVED' || e.status === 404 || e.status === 403);
      set({ id: 'binding', project: slug, level: gone ? 'FAIL' : 'WARN', message: e instanceof ApiError ? `${e.code}: ${e.message}` : 'board check failed', fix: gone ? 'bind the project to another board (rodo init --board)' : undefined });
    }
  }
  return out;
}

/** R8: read-only; exit code is always 0. */
export async function runDoctor(ctx: Ctx): Promise<number> {
  const d = discover(ctx.cwd);
  const only = new Set(ctx.opts.project ?? []);
  const checks = (await serverChecks(d, localChecks(d))).filter((c) => !c.project || !only.size || only.has(c.project));
  for (const c of checks) {
    const line = `${c.id}${c.project ? ` [${c.project}]` : ''}: ${c.message}${c.fix ? `  → ${c.fix}` : ''}`;
    if (c.level === 'OK') ctx.out.ok(line);
    else if (c.level === 'WARN') ctx.out.warn(line);
    else if (c.level === 'FAIL') ctx.out.fail(line);
    else if (c.level === 'INFO') ctx.out.info(line);
    else ctx.out.line(`SKIP ${c.id}: ${c.message}`.replace(/^SKIP (\S+): not connected$/, 'SKIP $1 (not connected)'));
  }
  ctx.out.flush({ version: 1, checks });
  return 0;
}
