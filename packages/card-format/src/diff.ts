import type { ChecklistOp, DecisionOp, PushOp, RefsOps, SetOps, StatusGroup } from '@rodo/protocol';
import { fieldEquals } from './compare';
import type { CardModel, ChecklistModel, ItemModel } from './model';

export type LocalChanges = Pick<PushOp, 'fields' | 'members' | 'labels' | 'refs' | 'checklists' | 'decisions'>;

export const isHold = (s: CardModel['status']): boolean => s === 'blocked' || s === 'cancelled';

/** The `status` sync group: reason only on a hold status, blockerType only when blocked (G2, ref/11 §4.1). */
export function statusGroup(m: CardModel): StatusGroup {
  return {
    status: m.status,
    list: m.list ?? null,
    statusReason: isHold(m.status) ? m.statusReason : null,
    blockerType: m.status === 'blocked' ? m.blockerType : null,
  };
}

function setOps(base: string[], local: string[]): SetOps | undefined {
  const add = local.filter((x) => !base.includes(x));
  const remove = base.filter((x) => !local.includes(x));
  return add.length || remove.length ? { add, remove } : undefined;
}

const itemKey = (i: ItemModel, n: number) => i.id ?? i.tempId ?? `tmp_i_${n}`;

function itemSet(b: ItemModel | undefined, l: ItemModel): ChecklistOp['items'][number]['set'] | undefined {
  const set: NonNullable<ChecklistOp['items'][number]['set']> = {};
  if (!b || !fieldEquals('title', b.title, l.title)) set.title = l.title;
  if (!b || b.isDone !== l.isDone) set.isDone = l.isDone;
  if (!b || (b.assignee ?? null) !== (l.assignee ?? null)) set.assignee = l.assignee;
  if (!b || b.minutes !== l.minutes) set.minutes = l.minutes;
  if (!b) set.kind = l.kind;
  return Object.keys(set).length ? set : undefined;
}

function checklistOp(b: ChecklistModel | undefined, l: ChecklistModel, order: number | null, seq: { n: number }): ChecklistOp | null {
  const items: ChecklistOp['items'] = [];
  let prev: string | null = null;
  for (const li of l.items) {
    const n = seq.n++;
    const bi = li.id ? b?.items.find((x) => x.id === li.id) : undefined;
    const key = itemKey(li, n);
    if (!bi) {
      // a new approval item may be created, never already ticked (the validator reports that)
      if (li.kind === 'approval' && li.isDone) { prev = li.id ?? prev; continue; }
      items.push({ tempId: li.id ? undefined : key, id: li.id, set: itemSet(undefined, li), after: prev });
    } else if (bi.kind === 'approval') {
      // approval items are human-owned: no tick, untick or retitle op
    } else {
      const set = itemSet(bi, li);
      if (set) items.push({ id: li.id, set });
    }
    prev = li.id ?? key;
  }
  for (const bi of b?.items ?? []) {
    if (bi.kind === 'approval') continue;
    if (!l.items.some((x) => x.id === bi.id)) items.push({ id: bi.id, delete: true });
  }
  const titleChanged = !b || !fieldEquals('title', b.title, l.title);
  if (!items.length && !titleChanged && order === null) return null;
  return { id: l.id, tempId: l.id ? undefined : `tmp_c_${seq.n++}`, title: titleChanged ? l.title : null, order, items };
}

export function diffModels(base: CardModel, local: CardModel): LocalChanges {
  const fields: NonNullable<PushOp['fields']> = {};
  const eq = fieldEquals;
  if (!eq('title', base.title, local.title)) fields.title = local.title;
  if (!eq('description', base.description, local.description)) fields.description = local.description;
  if (!eq('status', statusGroup(base), statusGroup(local))) {
    // the list written in the file is where the card was; a changed status without a changed list lets the server pick the list
    const g = statusGroup(local);
    fields.status = (base.list ?? null) === (local.list ?? null) ? { ...g, list: null } : g;
  }
  if (base.priority !== local.priority) fields.priority = local.priority;
  if ((base.coverColor ?? null) !== (local.coverColor ?? null)) fields.coverColor = local.coverColor;
  if (!eq('startAt', base.startAt, local.startAt)) fields.startAt = local.startAt;
  if (!eq('dueAt', base.dueAt, local.dueAt)) fields.dueAt = local.dueAt;
  if (!eq('hours', base.hoursMinutes, local.hoursMinutes)) fields.hours = local.hoursMinutes;
  if (!eq('financial', base.financial, local.financial)) fields.financial = local.financial;
  if (!eq('scope', base.scope, local.scope)) fields.scope = local.scope ?? { allowed: [], forbidden: [] };
  if (!eq('test', base.test, local.test)) fields.test = local.test;

  const out: LocalChanges = {};
  if (Object.keys(fields).length) out.fields = fields;
  const members = setOps(base.members, local.members);
  if (members) out.members = members;
  const labels = setOps(base.labels, local.labels);
  if (labels) out.labels = labels;

  // refs: identity is the id when there is one, else the path
  const refKey = (r: { id?: string; path: string }) => r.id ?? r.path;
  const refs: RefsOps = {
    add: local.refs.filter((r) => !base.refs.some((b) => refKey(b) === refKey(r) || b.path === r.path)).map((r) => ({ title: r.title, path: r.path })),
    remove: base.refs.filter((b) => !local.refs.some((r) => refKey(b) === refKey(r) || b.path === r.path)).map((b) => ({ title: b.title, path: b.path })),
    retitle: local.refs.flatMap((r) => {
      const b = base.refs.find((x) => x.id && x.id === r.id);
      return b && !eq('title', b.title, r.title) ? [{ id: r.id!, title: r.title }] : [];
    }),
  };
  if (refs.add.length || refs.remove.length || refs.retitle.length) out.refs = refs;

  const seq = { n: 1 };
  const cops: ChecklistOp[] = [];
  let pos = 0;
  for (const l of local.checklists) {
    const b = l.id ? base.checklists.find((x) => x.id === l.id) : undefined;
    const baseIdx = b ? base.checklists.indexOf(b) : -1;
    const op = checklistOp(b, l, b && baseIdx !== pos ? pos : null, seq);
    if (op) cops.push(op);
    pos++;
  }
  if (cops.length) out.checklists = cops;

  const dops: DecisionOp[] = [];
  let dn = 1;
  for (const d of local.decisions) {
    const b = d.id ? base.decisions.find((x) => x.id === d.id) : undefined;
    const set = { question: d.question, options: d.options };
    if (!b) dops.push({ tempId: d.id ? undefined : `tmp_d_${dn++}`, id: d.id, set });
    else if (!b.answer) {
      const same = eq('text', b.question, d.question) && b.options.length === d.options.length
        && b.options.every((o, i) => o.key === d.options[i]!.key && eq('text', o.text, d.options[i]!.text));
      if (!same) dops.push({ id: d.id, set });
    }
  }
  for (const b of base.decisions) {
    // an open decision removed from the file is withdrawn; an answered one stays (ref/11 §5.2)
    if (!b.answer && !local.decisions.some((d) => d.id === b.id)) dops.push({ id: b.id, withdraw: true });
  }
  if (dops.length) out.decisions = dops;
  return out;
}

export const isEmptyChanges = (c: LocalChanges): boolean => Object.keys(c).length === 0;
