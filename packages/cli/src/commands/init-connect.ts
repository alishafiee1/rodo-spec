import { join } from 'node:path';
import type { ConnectResponse, MetaResponse } from '@rodo/protocol';
import { apiHttp, loginConnect, loginDeviceCode } from '../auth/login';
import { getToken } from '../auth/token-store';
import type { Ctx } from '../core/context';
import { discover } from '../core/discovery';
import { CliError } from '../core/errors';
import { isShallow, remoteHint, repoFingerprint } from '../core/git';
import { readProject, writeProject } from '../core/project';
import { ApiError } from '../net/errors';
import type { Http } from '../net/http';
import { syncProject } from '../sync/run';
import { newState, writeState } from '../sync/state';
import { addGitignore, CARDS_LINE, missingGitignoreLines } from '../kit/project-scaffold';
import { nextSteps } from './init';
import { execFileSync } from 'node:child_process';
import { defaultServer } from './server';
import { CLI_VERSION } from './version';
import type { InitArgs } from './init';

interface Me { deviceId: string; name: string; scopes: string[]; boardIds: string[] }
interface WorkspaceRow { id: string; name: string; role: string; projects: { id: string; name: string }[] }

const pick = async (ctx: Ctx, title: string, rows: string[], zero?: string): Promise<number> => {
  ctx.out.line(title);
  rows.forEach((r, i) => ctx.out.line(`  ${i + 1}) ${r}`));
  if (zero) ctx.out.line(`  0) ${zero}`);
  const n = Number(await ctx.prompt.ask('Number', '1'));
  if (!Number.isInteger(n) || n < (zero ? 0 : 1) || n > rows.length) throw new CliError('USAGE', 'USAGE: not a number from the list', 2);
  return n;
};

/** ref/13 §2 steps 7-13. */
export async function connectProject(ctx: Ctx, root: string, slug: string, a: InitArgs, data: Record<string, unknown>): Promise<number> {
  const out = ctx.out;
  const projectDir = join(root, 'rodo', slug);
  const current = readProject(projectDir, slug).project!;

  // 7. server
  const server = (a.server ?? (process.env.RODO_SERVER?.trim() ? defaultServer() : undefined) ?? current.serverUrl ?? (await ctx.prompt.ask('Server', defaultServer()))).replace(/\/$/, '');
  data.server = server;

  // 8. login
  let tok = getToken(server);
  if (tok && !a.connect) {
    try {
      const { http } = await apiHttp(server, tok.token, CLI_VERSION);
      await http.get('/v1/devices/me');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.offline === false)) tok = null;
      else throw e;
    }
  }
  let connectBoard: ConnectResponse['board'] | null = null;
  if (a.connect) connectBoard = (await loginConnect(server, CLI_VERSION, a.connect)).board;
  else if (!tok) await loginDeviceCode(server, CLI_VERSION, { print: (l) => process.stderr.write(`${l}\n`), sleep: ctx.sleep });

  const { http, apiBaseUrl } = await apiHttp(server, getToken(server)!.token, CLI_VERSION);
  const me = await http.get<Me>('/v1/devices/me');

  // 9. which board
  let boardId: string;
  if (connectBoard) boardId = connectBoard.id;
  else if (a.board) boardId = a.board;
  else if (a.createBoard) boardId = await createBoard(ctx, http, me, slug, current.name, root);
  else {
    const boards = await http.get<{ id: string; title: string; workspace: { name: string }; canWrite: boolean }[]>('/v1/sync/boards');
    const canCreate = me.scopes.includes('boards:create');
    if (!boards.length && !canCreate) {
      throw new CliError('NO_BOARDS', 'NO_BOARDS: you have no board yet. Create one on the web, then run rodo init again.', 4);
    }
    const n = await pick(ctx, 'Boards:', boards.map((b) => `${b.title} (${b.workspace.name})${b.canWrite ? '' : ' [read only]'}`), canCreate ? 'create a new board' : undefined);
    boardId = n === 0 ? await createBoard(ctx, http, me, slug, current.name, root) : boards[n - 1]!.id;
  }
  data.boardId = boardId;

  // 11. bind
  let fp: string | null = null;
  if (isShallow(root)) out.line('REPO_SHALLOW: shallow clone; the repository check is skipped');
  else fp = repoFingerprint(root);
  let meta: MetaResponse;
  try {
    const r = await http.post<{ meta: MetaResponse; warnings: string[] }>(`/v1/sync/boards/${boardId}/bind`, {
      projectSlug: slug, folderLabel: `rodo/${slug}`, ...(fp ? { repoFingerprint: fp } : {}), ...(remoteHint(root) ? { repoRemoteHint: remoteHint(root) } : {}), materialize: 'ALL',
    });
    meta = r.meta;
    for (const w of r.warnings) out.line(`${w}: the repository identity will be set by a later sync`);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'REPOSITORY_MISMATCH') {
      throw new CliError('REPOSITORY_MISMATCH', `REPOSITORY_MISMATCH: ${e.message} (expected ${String(e.body.expected)}, got ${String(e.body.got)})`, 6);
    }
    if (e instanceof ApiError) throw new CliError(e.code, `${e.code}: ${e.message}`, e.status === 401 ? 4 : 1);
    throw e;
  }
  writeProject(projectDir, { ...current, serverUrl: server, boardId, repoFingerprint: fp });
  const state = newState({ serverUrl: server, apiBaseUrl, boardId, deviceId: me.deviceId });
  state.meta = meta;
  writeState(projectDir, state);
  out.line(`Bound rodo/${slug} to board "${meta.board.title}" on ${server}`);

  // 12. first sync
  const ref = discover(root).projects.find((p) => p.slug === slug)!;
  const run = await syncProject(root, ref, {}, CLI_VERSION);
  out.line(run.header);
  for (const n of run.notes) out.line(`  ${n}`);
  data.firstSync = run.report.summary;

  // 13. next steps
  // now the board holds the cards: keep them out of git from here on
  if (missingGitignoreLines(root).includes(CARDS_LINE)) {
    addGitignore(root);
    out.line(`.gitignore: added ${CARDS_LINE} (cards now live on the board)`);
    if (tracked(root, `rodo/${slug}`)) out.line(`Card files are already in git. To stop tracking them (the files stay): git rm --cached -r --ignore-unmatch "rodo/${slug}/**/*.rodo.md"`);
  }

  out.line('');
  out.line(nextSteps({ bound: true, gitignore: true }));
  return run.exit;
}

/** Steps 10: only for a person at a terminal, only with the scope, only after typing the exact title. */
async function createBoard(ctx: Ctx, http: Http, me: Me, slug: string, name: string, root: string): Promise<string> {
  if (!me.scopes.includes('boards:create')) {
    throw new CliError(
      'BOARD_CREATE_NOT_ALLOWED',
      'BOARD_CREATE_NOT_ALLOWED: this device may not create boards. Create the board on the web and run rodo init again, or run rodo login again and tick "allow creating boards from this device" on the approval page.',
      4,
    );
  }
  if (!ctx.prompt.interactive) {
    throw new CliError(
      'BOARD_CREATE_NEEDS_HUMAN',
      'BOARD_CREATE_NEEDS_HUMAN: creating a board needs a person. Open a terminal yourself (not through an AI assistant or a pipe) and run: rodo init --create-board',
      4,
    );
  }
  const ws = await http.get<WorkspaceRow[]>('/v1/sync/workspaces');
  const usable = ws.filter((w) => w.role === 'OWNER' || w.role === 'MEMBER');
  if (!usable.length) throw new CliError('BOARD_CREATE_FORBIDDEN', 'BOARD_CREATE_FORBIDDEN: you cannot create boards in any workspace', 4);
  const w = usable[(await pick(ctx, 'Workspaces:', usable.map((x) => x.name))) - 1]!;
  if (!w.projects.length) throw new CliError('NO_PROJECT', 'NO_PROJECT: this workspace has no project; create one on the web first', 4);
  const p = w.projects[(await pick(ctx, 'Projects:', w.projects.map((x) => x.name))) - 1]!;
  const title = (await ctx.prompt.ask('Board title', name || slug)).trim();
  ctx.out.line(`This creates the board "${title}" in ${w.name} / ${p.name} from device ${me.name}.`);
  const typed = (await ctx.prompt.ask('Type the board title exactly to confirm')).trim();
  if (typed !== title) throw new CliError('CONFIRM_TITLE_MISMATCH', 'CONFIRM_TITLE_MISMATCH: the title you typed is different; nothing was created', 2);
  const fp = isShallow(root) ? null : repoFingerprint(root);
  try {
    const r = await http.post<{ board: { id: string } }>('/v1/sync/boards', {
      workspaceId: w.id, projectId: p.id, title, template: 'rodo', projectSlug: slug, ...(fp ? { repoFingerprint: fp } : {}), ...(remoteHint(root) ? { repoRemoteHint: remoteHint(root) } : {}), confirmTitle: typed,
    });
    return r.board.id;
  } catch (e) {
    if (e instanceof ApiError) throw new CliError(e.code, `${e.code}: ${e.message}`, e.code === 'DEVICE_TOKEN_SCOPE' ? 4 : 1);
    throw e;
  }
}

/** True when git already tracks a card file under the folder. */
function tracked(root: string, dir: string): boolean {
  try {
    return execFileSync('git', ['ls-files', '--', `${dir}/**/*.rodo.md`, `${dir}/*.rodo.md`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0;
  } catch {
    return false;
  }
}
