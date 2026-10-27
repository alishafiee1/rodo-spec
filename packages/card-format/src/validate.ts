import { boardChecks } from './board-checks';
import { finding } from './codes';
import { fieldEquals } from './compare';
import { methodHints } from './hints';
import type { CardModel, Finding, ValidateContext } from './model';
import { isError, parseCardFull } from './parse';
import { refPathOnly } from './refs';

const BOARD_PLACEHOLDER = 'SET-AFTER-RODO-INIT';

export function validateCard(text: string, ctx: ValidateContext): { model: CardModel | null; errors: Finding[]; warnings: Finding[] } {
  const p = parseCardFull(text);
  const out = [...p.findings];
  const m = p.model;
  const info = p.info;
  if (m && info) {
    const kl = (k: string) => info.keyLine[k] ?? null;
    const base = ctx.base;

    if (m.boardId === BOARD_PLACEHOLDER && !ctx.boundBoardId) out.push(finding('BOARD_ID_PLACEHOLDER', kl('boardId')));
    else if (m.boardId && ctx.boundBoardId && m.boardId !== ctx.boundBoardId) {
      out.push(finding('BOARD_MISMATCH', kl('boardId'), { boardId: ctx.boundBoardId }));
    }
    const dup = m.id ? ctx.knownIds?.[m.id] : undefined;
    if (dup && dup !== ctx.relPath) out.push(finding('CARD_ID_DUPLICATE', kl('id'), { path: dup }));

    // server/CLI owned keys: local edits are ignored
    if (base) {
      if (info.fileUpdatedAt !== undefined && info.fileUpdatedAt !== null && info.fileUpdatedAt !== base.updatedAt
        && !out.some((f) => f.code === 'UPDATED_AT_EDITED')) out.push(finding('UPDATED_AT_EDITED', kl('updatedAt')));
      m.updatedAt = base.updatedAt;
    }
    const lockedNow = base?.locked ?? false;
    if (info.fileLocked !== undefined && info.fileLocked !== null && info.fileLocked !== lockedNow
      && !out.some((f) => f.code === 'LOCKED_EDITED')) out.push(finding('LOCKED_EDITED', kl('locked')));
    m.locked = lockedNow;

    for (const r of m.refs) {
      if (ctx.repoFileExists(refPathOnly(r.path))) continue;
      const known = base?.refs.some((b) => b.path === r.path);
      out.push(finding(known ? 'REF_MISSING_LOCAL' : 'REF_NOT_FOUND', null, { path: r.path }));
    }

    out.push(...decisionRules(m, base));
    out.push(...approvalRules(m, base));
    if (ctx.meta) out.push(...boardChecks(m, ctx.meta, info.keyLine));
    out.push(...methodHints(m, ctx, info.hasRefsSection));
  } else if (/\.rodo\.md$/i.test(ctx.relPath) && !/\.rodo\.md$/.test(ctx.relPath)) {
    out.push(finding('FILE_EXT_CASE', null));
  }
  return { model: m, errors: out.filter(isError), warnings: out.filter((f) => !isError(f)) };
}

function decisionRules(m: CardModel, base: CardModel | null): Finding[] {
  const out: Finding[] = [];
  for (const d of m.decisions) {
    const b = d.id ? base?.decisions.find((x) => x.id === d.id) : undefined;
    if (d.answer && !(b?.answer && b.answer.key === d.answer.key && (b.answer.note ?? null) === (d.answer.note ?? null))) {
      out.push(finding('DECISION_ANSWER_REQUIRES_HUMAN', null, { question: d.question }));
    }
    if (b?.answer) {
      const same = fieldEquals('text', b.question, d.question) && b.options.length === d.options.length
        && b.options.every((o, i) => o.key === d.options[i]!.key && fieldEquals('text', o.text, d.options[i]!.text));
      if (!same) out.push(finding('DECISION_ANSWERED_READONLY', null, { question: b.question }));
    }
  }
  return out;
}

function approvalRules(m: CardModel, base: CardModel | null): Finding[] {
  const out: Finding[] = [];
  const local = m.checklists.flatMap((c) => c.items).filter((i) => i.kind === 'approval');
  const baseItems = (base?.checklists ?? []).flatMap((c) => c.items);
  for (const b of baseItems.filter((i) => i.kind === 'approval' && i.id)) {
    const l = m.checklists.flatMap((c) => c.items).find((i) => i.id === b.id);
    if (!l || l.kind !== 'approval' || l.isDone !== b.isDone || !fieldEquals('title', l.title, b.title)) {
      out.push(finding('APPROVAL_REQUIRES_HUMAN', null, { title: b.title }));
    }
  }
  for (const l of local) {
    const inBase = !!l.id && baseItems.some((i) => i.id === l.id);
    // a new approval item may not arrive already ticked; with no base only id-less items are "new"
    if (l.isDone && !inBase && (base || !l.id)) out.push(finding('APPROVAL_REQUIRES_HUMAN', null, { title: l.title }));
  }
  return out;
}
