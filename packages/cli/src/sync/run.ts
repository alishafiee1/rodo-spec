import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cardStateToModel, diffModels, emptyModel, isEmptyChanges, serializeCard, type CardModel, type Finding } from '@rodo/card-format';
import type { CardState, ChangesResponse, MetaResponse, OpResult, PushOp, ValidationReport } from '@rodo/protocol';
import { getToken } from '../auth/token-store';
import { scanCards, type CardFile, type ScanOptions } from '../core/cards';
import type { ProjectRef } from '../core/discovery';
import { CliError } from '../core/errors';
import { sha256, writeJson } from '../core/fs-atomic';
import { gitBranch, gitHead, isShallow, repoFingerprint } from '../core/git';
import { acquireLock } from '../core/lock';
import { discover } from '../net/discovery';
import { ApiError } from '../net/errors';
import { Http } from '../net/http';
import { computeOffset, editedAt as clampEditedAt, formatOffset } from './clock';
import { applyMarkers, buildReport, type ExtraFindings, type LastSync } from './offline';
import { sendBatches, sendValidation, splitBatches, type PlannedOp, type PushEnvelope } from './push';
import { newState, readBase, readState, writeState, type SyncState } from './state';
import { conflictValue, materializePath, moveToTrash, regenerate, saveLocalCopy, saveServerCopy, writeCard } from './write-back';

export interface SyncFlags {
  dryRun?: boolean;
  pullOnly?: boolean;
  pushOnly?: boolean;
  confirmArchive?: boolean;
  check?: boolean;
}

export interface ProjectRun {
  exit: number;
  report: LastSync;
  cards: CardFile[];
  extra: ExtraFindings;
  /** project-level lines shown before the file findings (OFFLINE, ARCHIVE_CONFIRM_REQUIRED, drift...) */
  notes: string[];
  header: string;
}

const ARCHIVE_LIMIT = 10;
const WARNING_CODES = new Set(['ITEM_DELETED_ON_SERVER', 'CONFLICT_RESOLVED', 'SIMPLE_DOC_BRANCH_CHANGED', 'SERVER_CHANGED_WHILE_INVALID', 'REPO_SHALLOW']);
const tempId = () => `tmp_${Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')}`;

const finding = (code: string, message: string): Finding => ({ code, line: null, message: `${code}: ${message}` });

/** ref/12 §7 for one project. Never throws for a server problem: it validates, reports and returns the exit code. */
export async function syncProject(root: string, ref: ProjectRef, flags: SyncFlags, cliVersion: string, lockWaitMs?: number): Promise<ProjectRun> {
  const dir = ref.dir;
  const project = ref.project!;
  const startedAt = Date.now();
  const notes: string[] = [];
  const extra: ExtraFindings = new Map();
  const counters = { pulled: 0, pushed: 0, created: 0, archived: 0 };
  const conflicts: LastSync['conflicts'] = [];
  let exit = 0;
  let mode: 'online' | 'offline' = 'offline';
  let clock: LastSync['clock'] = { source: 'system', offsetMs: 0 };

  const release = flags.dryRun ? () => {} : await acquireLock(join(dir, '.rodo', 'sync.lock'), lockWaitMs);
  if (!release) throw new CliError('SYNC_LOCKED', `SYNC_LOCKED: another rodo sync is running for ${ref.slug}`, 5);

  const add = (path: string, kind: 'errors' | 'warnings', code: string, message: string) => {
    const e = extra.get(path) ?? { errors: [], warnings: [] };
    e[kind].push(finding(code, message));
    extra.set(path, e);
  };
  const scanOpts = (state: SyncState | null): ScanOptions => ({
    baseOf: (id) => {
      const b = state?.cards[id] ? readBase(dir, id) : null;
      return b ? cardStateToModel(b) : null;
    },
    meta: state?.meta ?? null,
  });

  let state: SyncState | null = readState(dir);
  const link: { online: { http: Http; st: SyncState; offsetMs: number } | null } = { online: null };
  try {
    const serverUrl = project.serverUrl;
    if (!project.boardId || !serverUrl) {
      notes.push('OFFLINE: this project is not bound to a board (run rodo init); cards were validated only');
    } else {
      const tok = getToken(serverUrl);
      if (!tok) {
        notes.push('AUTH_REQUIRED: run rodo login; cards were validated only');
        exit = 4;
      } else {
        state ??= newState({ serverUrl, apiBaseUrl: serverUrl, boardId: project.boardId, deviceId: tok.deviceId });
        const online = await runOnline();
        if (online) mode = 'online';
      }
    }
  } catch (e) {
    exit = Math.max(exit, handleFailure(e));
  }

  // ---- report (always): markers, last-sync.json, state ----
  const cards = applyMarkers(root, ref, scanOpts(state), extra, flags.dryRun);
  // validation entries for invalid files that have an id (line numbers include the marker line), and the ack of this pull
  const online = link.online;
  if (online && !flags.dryRun && !flags.check) {
    const validation: ValidationReport[] = cards
      .filter((c) => c.errors.length && c.model?.id)
      .map((c) => ({ cardId: c.model!.id!, path: c.path, errors: c.errors.map((x) => ({ code: x.code, line: x.line, message: x.message })), warnings: c.warnings.map((x) => ({ code: x.code, line: x.line, message: x.message })) }));
    if (validation.length || counters.pulled) {
      try {
        await sendValidation(online.http, project.boardId!, envelope(online.st, online.offsetMs), validation);
      } catch {
        /* the reports are best effort: the next run sends them again */
      }
    }
  }
  const report = buildReport(ref.slug, cards, startedAt, { mode, clock, ...counters, conflicts, notes: [...notes] }, extra);
  if (!flags.dryRun) {
    writeJson(join(dir, '.rodo', 'last-sync.json'), report);
    if (state && mode === 'online') {
      state.lastSyncAt = Date.now() + clock.offsetMs;
      writeState(dir, state);
    }
  }
  release();
  const s = report.summary;
  const head =
    mode === 'online'
      ? `rodo/${ref.slug}  ▸ pulled ${counters.pulled} · pushed ${counters.pushed}${counters.created ? ` (${counters.created} new)` : ''}${counters.archived ? ` (${counters.archived} archived)` : ''} · conflicts ${conflicts.length} · errors ${s.errors} · warnings ${s.warnings}   [clock: ${clock.source === 'server' ? `server ${formatOffset(clock.offsetMs)}` : 'system'}]`
      : `rodo/${ref.slug}  ▸ offline · files ${s.files} · errors ${s.errors} · warnings ${s.warnings}`;
  return { exit, report, cards, extra, notes, header: head };

  // ------------------------------------------------------------------------

  function handleFailure(e: unknown): number {
    if (!(e instanceof ApiError)) throw e;
    if (e.offline) {
      notes.push('OFFLINE: the server cannot be reached; cards were validated only');
      return 0;
    }
    if (e.code === 'REPOSITORY_MISMATCH') {
      notes.push(`REPOSITORY_MISMATCH: ${e.message} (expected ${String(e.body.expected ?? '?')}, got ${String(e.body.got ?? '?')}); this project is not synced`);
      return 6;
    }
    if (e.status === 401 || ['DEVICE_REVOKED', 'DEVICE_EXPIRED', 'DEVICE_TOKEN_INVALID'].includes(e.code)) {
      notes.push(`${e.code}: ${e.message}; run rodo login`);
      return 4;
    }
    if (e.code === 'CLI_TOO_OLD') {
      notes.push(`CLI_TOO_OLD: update the rodo CLI (server wants ${String(e.body.minCliVersion ?? 'a newer version')})`);
      return 4;
    }
    notes.push(`${e.code}: ${e.message}`);
    return 1;
  }

  /** The online part. Returns true when it got through the server handshake. */
  async function runOnline(): Promise<boolean> {
    const st = state!;
    const serverUrl = project.serverUrl!;
    const boardId = project.boardId!;
    const token = getToken(serverUrl)!.token;
    const disc = await discover(serverUrl);
    st.apiBaseUrl = disc.apiBaseUrl;

    let fp: string | null = null;
    if (isShallow(root)) notes.push('REPO_SHALLOW: shallow clone; the repository check is skipped');
    else fp = repoFingerprint(root);
    if (fp && project.repoFingerprint && fp !== project.repoFingerprint) {
      throw new ApiError(409, 'REPOSITORY_MISMATCH', 'this folder is not the repository the project was bound to', { expected: project.repoFingerprint.slice(0, 19), got: fp.slice(0, 19) });
    }
    const http = new Http({ baseUrl: disc.apiBaseUrl, token, cliVersion, fingerprint: fp });

    // clock (once per run)
    const t0 = Date.now();
    const time = await http.get<{ serverTimeMs: number }>('/v1/sync/time');
    const offsetMs = computeOffset(t0, Date.now(), time.serverTimeMs);
    st.clock = { offsetMs, source: 'server' };
    clock = st.clock;

    st.meta = await http.get<MetaResponse>(`/v1/sync/boards/${boardId}/meta`);
    mode = 'online';

    if (flags.check) {
      const m = await http.post<{ stale: string[]; unknown: string[]; archived: string[]; deleted: string[]; syncSeq: string }>(`/v1/sync/boards/${boardId}/manifest`, {
        cards: Object.entries(st.cards).map(([id, c]) => ({ id, baseRev: c.baseRev })),
      });
      const drift = m.stale.length + m.unknown.length + m.archived.length + m.deleted.length;
      // nothing drifted: no warning line (dogfood #13)
      if (drift) notes.push(`DRIFT: stale ${m.stale.length}, unknown ${m.unknown.length}, archived ${m.archived.length}, deleted ${m.deleted.length} (board seq ${m.syncSeq}, local seq ${st.lastSeq})`);
      return true;
    }

    const remoteSeen = new Map<string, CardState>();
    let scan = scanCards(root, ref, [], scanOpts(st));
    const localById = () => new Map(scan.filter((c) => c.model?.id).map((c) => [c.model!.id!, c]));

    // ---- pull ----
    if (!flags.pushOnly) {
      let since = st.lastSeq;
      for (let guard = 0; guard < 10_000; guard++) {
        let page: ChangesResponse;
        try {
          page = await http.get<ChangesResponse>(`/v1/sync/boards/${boardId}/changes`, { since, limit: 200 });
        } catch (e) {
          if (e instanceof ApiError && e.code === 'RESYNC_REQUIRED' && since !== '0') {
            notes.push('RESYNC_REQUIRED: deletes were purged on the board; pulling everything again and merging against the base copies');
            since = '0';
            st.lastSeq = '0';
            continue;
          }
          throw e;
        }
        for (const card of page.cards) {
          remoteSeen.set(card.id, card);
          if (!flags.dryRun) applyRemote(card, localById());
          else counters.pulled += st.cards[card.id]?.baseRev === card.rev ? 0 : 1;
        }
        for (const t of page.tombstones) {
          if (t.entity === 'CARD' && st.cards[t.cardId] && !flags.dryRun) {
            moveToTrash(dir, st, t.cardId, st.cards[t.cardId]!.path);
            counters.pulled++;
          }
        }
        if (!flags.dryRun) {
          st.lastSeq = page.toSeq;
          writeState(dir, st);
        }
        since = page.toSeq;
        if (!page.hasMore) break;
      }
      scan = scanCards(root, ref, [], scanOpts(st));
    }

    // ---- plan and push ----
    const allValid = scan.filter((c) => c.model && c.errors.length === 0);
    if (!flags.pullOnly) {
      const planned = plan(st, scan, allValid, remoteSeen, offsetMs);
      if (flags.dryRun) {
        notes.push(`DRY_RUN: would push ${planned.length} op(s); nothing was written`);
        return true;
      }
      await pushAll(http, st, planned, scan, offsetMs);
    }

    link.online = { http, st, offsetMs };
    return true;
  }

  function envelope(st: SyncState, offsetMs: number): PushEnvelope {
    return {
      deviceId: st.deviceId,
      clientNowMs: Date.now() + offsetMs,
      clock: st.clock.source === 'server' ? 'server' : 'local',
      offsetMs,
      ackSeq: st.lastSeq,
    };
  }

  // ---- merge one remote card into the working tree ----
  function applyRemote(R: CardState, locals: Map<string, CardFile>) {
    const st = state!;
    const entry = st.cards[R.id];
    const local = locals.get(R.id) ?? null;

    if (R.deleted || R.archived) {
      if (entry) {
        moveToTrash(dir, st, R.id, entry.path);
        counters.pulled++;
      }
      return;
    }
    if (!entry && !local) {
      const path = materializePath(dir, R);
      writeCard(dir, st, R, path, null, { lastSyncAt: Date.now() + st.clock.offsetMs });
      counters.pulled++;
      return;
    }
    if (entry && entry.baseRev === R.rev) return; // already have it
    if (!entry || !readBase(dir, R.id)) return; // a file with this id that this checkout never synced: the plan step handles it

    if (!local) {
      // file deleted here, but the card changed on the board after our base: the delete does not win; restore it
      writeCard(dir, st, R, entry.path, null, { lastSyncAt: Date.now() + st.clock.offsetMs });
      add(entry.path, 'warnings', 'CONFLICT_RESOLVED', 'the card changed on the board after you deleted its file; the file was restored');
      counters.pulled++;
      return;
    }
    if (local.errors.length || !local.model) {
      saveServerCopy(dir, R);
      add(local.path, 'warnings', 'SERVER_CHANGED_WHILE_INVALID', `the card changed on the board while this file is invalid; the board copy is in rodo/${ref.slug}/.rodo/conflicts/${R.id}.server.rodo.md`);
      return;
    }
    const base = readBase(dir, R.id)!;
    const changes = diffModels(cardStateToModel(base), local.model);
    const simpleChanged = simpleInfo(local, entry) !== null;
    if (isEmptyChanges(changes) && !simpleChanged) {
      // only the board changed: regenerate the file from the board copy
      writeCard(dir, st, R, local.path, local, { lastSyncAt: Date.now() + st.clock.offsetMs });
      counters.pulled++;
    }
    // both changed: the file stays as it is, the push (with the old baseRev) lets the server decide; the result is written back afterwards
  }

  /** The cycle's simple.md, when it is new or changed since the last push. */
  function simpleInfo(c: CardFile, entry: { simpleDocHash: string | null } | undefined): { path: string; hash: string; content: string } | null {
    const seg = c.path.split('/');
    if (seg[0] !== 'cycles' || seg.length < 3) return null;
    const file = join(dirname(c.abs), 'simple.md');
    if (!existsSync(file)) return null;
    const content = readFileSync(file, 'utf8');
    const hash = sha256(content);
    if (entry && entry.simpleDocHash === hash) return null;
    return { path: `/rodo/${ref.slug}/${seg.slice(0, 2).join('/')}/simple.md`, hash, content };
  }

  function plan(st: SyncState, all: CardFile[], valid: CardFile[], remote: Map<string, CardState>, offsetMs: number): PlannedOp[] {
    const out: PlannedOp[] = [];
    const now = Date.now();
    const branch = gitBranch(root);
    const commit = gitHead(root)?.slice(0, 7);
    const mk = (kind: PushOp['kind'], body: Omit<PushOp, 'opId' | 'kind' | 'formatVersion'>): PushOp => {
      const op = { kind, formatVersion: 2, ...body } as PushOp;
      return { ...op, opId: `sha256:${sha256(JSON.stringify({ d: st.deviceId, op })).slice(7)}` };
    };

    for (const c of valid) {
      const m = c.model as CardModel;
      const id = m.id;
      if (!id) {
        const tid = m.tempId ?? tempId();
        if (!m.tempId) {
          // crash safety: the tempId is in the file before the request leaves
          writeFileSync(c.abs, serializeCard({ ...m, tempId: tid }, { original: readFileSync(c.abs, 'utf8') }));
        }
        st.pendingCreates[tid] = st.pendingCreates[tid] ?? { path: c.path, firstPushAt: now };
        const changes = diffModels(emptyModel(), m);
        const simple = simpleInfo(c, undefined);
        out.push({
          op: mk('CREATE', { tempId: tid, baseRev: '0', editedAt: clampEditedAt({ mtimeMs: c.mtimeMs, offsetMs, lastSyncAt: 0, nowMs: now }), rodoPath: c.path, ...changes, ...(simple ? { simpleDoc: { path: simple.path, hash: simple.hash, content: simple.content, gitCommit: commit, gitBranch: branch ?? undefined } } : {}) }),
          path: c.path, id: null, ...(simple ? { simple: { hash: simple.hash, branch: branch ?? null } } : {}),
        });
        continue;
      }
      const entry = st.cards[id];
      const base = (entry ? readBase(dir, id) : null) ?? remote.get(id) ?? null;
      if (!base) continue;
      const changes = diffModels(cardStateToModel(base), m);
      const simple = simpleInfo(c, entry);
      const moved = !!entry && entry.path !== c.path;
      if (isEmptyChanges(changes) && !simple && !moved) continue;
      if (simple && entry?.simpleDocBranch && branch && entry.simpleDocBranch !== branch) {
        add(c.path, 'warnings', 'SIMPLE_DOC_BRANCH_CHANGED', `simple.md was last pushed from branch ${entry.simpleDocBranch}, now ${branch}`);
      }
      out.push({
        op: mk('UPDATE', { cardId: id, baseRev: base.rev, editedAt: clampEditedAt({ mtimeMs: c.mtimeMs, offsetMs, lastSyncAt: entry?.lastSyncAt ?? 0, nowMs: now }), rodoPath: c.path, ...changes, ...(simple ? { simpleDoc: { path: simple.path, hash: simple.hash, content: simple.content, gitCommit: commit, gitBranch: branch ?? undefined } } : {}) }),
        path: c.path, id, ...(simple ? { simple: { hash: simple.hash, branch: branch ?? null } } : {}),
      });
    }

    // deleted files -> ARCHIVE (R5)
    const archives: PlannedOp[] = [];
    for (const [id, entry] of Object.entries(st.cards)) {
      if (all.some((c) => c.model?.id === id) || existsSync(join(dir, entry.path))) continue;
      archives.push({
        op: mk('ARCHIVE', { cardId: id, baseRev: entry.baseRev, editedAt: Math.round(startedAt + offsetMs), rodoPath: entry.path }),
        path: entry.path, id,
      });
    }
    if (archives.length > ARCHIVE_LIMIT && !flags.confirmArchive) {
      notes.push(`ARCHIVE_CONFIRM_REQUIRED: ${archives.length} card files were deleted; nothing was archived. Ask the user, then run rodo sync --confirm-archive`);
    } else out.push(...archives);
    return out;
  }

  async function pushAll(http: Http, st: SyncState, planned: PlannedOp[], scan: CardFile[], offsetMs: number) {
    if (!planned.length) return;
    const outcome = await sendBatches(http, project.boardId!, envelope(st, offsetMs), splitBatches(planned));
    const byPath = new Map(scan.map((c) => [c.path, c]));
    for (const p of outcome.tooLarge) add(p.path, 'errors', 'PUSH_TOO_LARGE', 'this card alone is too big for one request');
    for (const p of planned) {
      const res = outcome.results.get(p.op.opId);
      if (res) handleResult(st, p, res, byPath.get(p.path) ?? null, outcome.serverTimeMs ?? Date.now());
    }
  }

  function handleResult(st: SyncState, p: PlannedOp, res: OpResult, local: CardFile | null, serverNow: number) {
    const path = p.path;
    for (const err of res.errors) {
      const code = WARNING_CODES.has(err.code) ? 'warnings' : 'errors';
      add(path, code, err.code, err.message);
    }
    // the losing local text is never thrown away: a copy of the file goes to .rodo/conflicts/ (dogfood P1-2)
    const lost = (res.conflicts ?? []).some((c) => c.winner === 'server') && local && res.card
      ? saveLocalCopy(dir, res.card.id, local.abs) : null;
    for (const c of res.conflicts ?? []) {
      const localValue = c.winner === 'server' && local?.model ? conflictValue(local.model, c.field) : undefined;
      conflicts.push({ path, field: c.field, winner: c.winner, ...(localValue !== undefined ? { localValue } : {}), ...(lost && c.winner === 'server' ? { localCopy: lost } : {}) });
      add(path, 'warnings', 'CONFLICT_RESOLVED', c.winner === 'server'
        ? `${c.field} changed on the board and here; kept the board value${localValue !== undefined ? ` (yours was: ${localValue})` : ''}; your file is saved in rodo/${ref.slug}/${lost ?? '.rodo/conflicts/'}`
        : `${c.field} changed on the board and here; kept your value`);
    }
    if (res.errors.some((e) => e.code === 'ARCHIVED')) {
      moveToTrash(dir, st, p.id, path); // archived on the board: the text stays in .rodo/trash
      return;
    }
    const card = res.card;
    if (p.op.kind === 'ARCHIVE') {
      if (res.status === 'APPLIED' && p.id) {
        delete st.cards[p.id];
        counters.archived++;
        counters.pushed++;
      } else if (card && !card.archived) {
        writeCard(dir, st, card, path, null, { lastSyncAt: serverNow }); // the delete did not win: the file comes back
      }
      return;
    }
    if (!card || res.status === 'REJECTED') return;

    if (res.status === 'PARTIAL' && local) {
      // the board value replaces the invalid one in the file; the text you wrote is kept next to the conflicts
      const backup = join(dir, '.rodo', 'conflicts', `${card.id}.local-${Date.now()}.rodo.md`);
      mkdirSync(dirname(backup), { recursive: true });
      copyFileSync(local.abs, backup);
    }
    const simpleFailed = res.errors.some((e) => e.field === 'simpleDoc');
    writeCard(dir, st, card, path, local, {
      lastSyncAt: serverNow,
      ...(p.simple && !simpleFailed ? { simpleDocHash: p.simple.hash, simpleDocBranch: p.simple.branch } : {}),
    });
    if (p.op.tempId) delete st.pendingCreates[p.op.tempId];
    if (res.status === 'APPLIED' || res.status === 'PARTIAL') {
      counters.pushed++;
      if (p.op.kind === 'CREATE') counters.created++;
    }
  }
}

export { regenerate };
