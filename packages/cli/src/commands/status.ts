import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanCards, type CardFile } from '../core/cards';
import type { Ctx } from '../core/context';
import type { ProjectRef } from '../core/discovery';
import { readJson, sha256 } from '../core/fs-atomic';
import { gitBranch, gitHead } from '../core/git';
import { pickLang, t } from '../core/i18n';
import { stamp } from '../core/time';
import { cardLabel } from '../core/cards';
import type { LastSync } from '../sync/offline';
import { LEGACY_MSG, load } from './shared';
import { boardChanges } from '../sync/board-view';
import { cardStateToModel, diffModels, isEmptyChanges } from '@rodo/card-format';
import type { CardState } from '@rodo/protocol';
import { readBase } from '../sync/state';
import { CLI_VERSION } from './version';

interface StateJson { lastSeq?: string; cards?: Record<string, { path: string; fileHash?: string; baseRev?: string }> }

/** ref/13 §4 sync states. `remote` = the board copy when it changed since our cursor (online status only). */
export function syncState(ref: ProjectRef, c: CardFile, state: StateJson | null, remote?: CardState | null, projectDir?: string): string {
  if (c.errors.length) return `invalid (${c.errors.length} error${c.errors.length > 1 ? 's' : ''})`;
  if (!ref.project?.boardId) return 'not-bound';
  const id = c.model?.id;
  if (!id) return 'local-new';
  const known = state?.cards?.[id];
  if (!known) return 'local-new';
  if (remote?.archived || remote?.deleted) return 'archived-on-board';
  const base = projectDir ? readBase(projectDir, id) : null;
  const localChanged = base && c.model
    ? !isEmptyChanges(diffModels(cardStateToModel(base), c.model))
    : !!known.fileHash && known.fileHash !== sha256(readFileSync(c.abs));
  const boardChanged = !!remote && remote.rev !== known.baseRev;
  if (localChanged && boardChanged) return 'conflict-pending';
  if (boardChanged) return 'board-changed';
  return localChanged ? 'local-changed' : 'clean';
}

export const openDecisions = (c: CardFile) => (c.model?.decisions ?? []).filter((d) => !d.answer);
export const pendingApprovals = (c: CardFile) =>
  (c.model?.checklists ?? []).flatMap((l) => l.items).filter((i) => i.kind === 'approval' && !i.isDone);

/** `rodo status --local` (and, until P3b, plain `rodo status`): read-only. */
export async function runStatus(ctx: Ctx, a: { local?: boolean }): Promise<number> {
  const { d, refs } = load(ctx, true);
  const projects: unknown[] = [];
  for (const ref of refs) {
    const cards = scanCards(d.root, ref);
    const state = readJson<StateJson>(join(ref.dir, '.rodo', 'state.json'));
    const last = readJson<LastSync>(join(ref.dir, '.rodo', 'last-sync.json'));
    const lang = pickLang(ctx.opts.lang, ref.project?.language.simple);
    const head = gitHead(d.root);
    const branch = gitBranch(d.root);

    const board = a.local ? null : await boardChanges(ref.project?.serverUrl ?? null, ref.project?.boardId ?? null, state as never, CLI_VERSION);
    if (ref.legacy) ctx.out.line(LEGACY_MSG);
    const bound = ref.project?.boardId ? `board ${ref.project.boardId}` : 'not connected to a board';
    ctx.out.line(`Project  ${ref.slug}  (${bound})${branch ? `      branch ${branch}${head ? ` @ ${head.slice(0, 7)}` : ''}` : ''}`);
    ctx.out.line(`Sync     ${last ? `last ${stamp(last.finishedAt)} · ${last.mode}` : 'never'}  (server: ${board ? `connected · board seq ${board.seq}` : 'not connected'})`);
    ctx.out.line('');
    ctx.out.line(`${'Card'.padEnd(44)} ${'Board'.padEnd(12)} ${'Local'.padEnd(12)} Sync`);
    const rows = cards.map((c) => {
      const title = c.model?.title ?? '(unreadable)';
      const label = c.number ? cardLabel(c.number, title) : c.path.replace(/\.rodo\.md$/i, '');
      const remote = c.model?.id ? board?.cards.get(c.model.id) ?? null : null;
      // the board copy only lists cards that changed since our cursor; for the rest the last synced copy is the board state (dogfood #12)
      const known = board && c.model?.id && state?.cards?.[c.model.id] ? readBase(ref.dir, c.model.id) : null;
      const boardStatus = remote ? (remote.archived || remote.deleted ? 'archived' : remote.status) : known?.status ?? null;
      return { path: c.path, key: c.key, title, status: c.errors.length ? null : c.model?.status ?? null, board: boardStatus, sync: syncState(ref, c, state, remote, ref.dir), errors: c.errors.length, label };
    });
    for (const r of rows) ctx.out.line(`${r.label.slice(0, 44).padEnd(44)} ${(r.board ?? '—').padEnd(12)} ${(r.status ?? '—').padEnd(12)} ${r.sync}`);
    const dec = cards.reduce((n, c) => n + openDecisions(c).length, 0);
    const apr = cards.reduce((n, c) => n + pendingApprovals(c).length, 0);
    ctx.out.line('');
    // conflicts the board won in the last sync: where your text is (dogfood P1-2)
    const lost = (last?.conflicts ?? []).filter((c) => c.winner === 'server');
    for (const c of lost) ctx.out.line(`Conflict ${c.path}: ${c.field} kept the board value${c.localValue !== undefined ? ` (yours: ${c.localValue})` : ''}${c.localCopy ? `; your file: rodo/${ref.slug}/${c.localCopy}` : ''}`);
    if (dec) ctx.out.line(`${t(lang, 'status.waitingDecision')}: ${dec}`);
    if (apr) ctx.out.line(`${t(lang, 'status.waitingApproval')}: ${apr}`);
    projects.push({
      project: ref.slug, boardId: ref.project?.boardId ?? null, branch, head, lastSyncAt: last?.finishedAt ?? null,
      cards: rows.map(({ label: _l, ...r }) => r), waitingDecision: dec, waitingApproval: apr, conflicts: lost,
    });
  }
  ctx.out.flush({ version: 1, projects });
  return 0;
}
