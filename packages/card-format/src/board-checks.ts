import { finding } from './codes';
import type { BoardMeta, CardModel, Finding } from './model';

const ROLE_FOR: Partial<Record<CardModel['status'], 'START' | 'ACTIVE' | 'END'>> = {
  todo: 'START', in_progress: 'ACTIVE', done: 'END',
};

/** ref/11 §6 --- needs meta from the last sync; the server repeats these on push. */
export function boardChecks(m: CardModel, meta: BoardMeta, keyLine: Record<string, number>): Finding[] {
  const out: Finding[] = [];
  if (!meta.capabilities.cardStatuses.includes(m.status)) {
    out.push(finding('STATUS_NOT_SUPPORTED', keyLine.status ?? null, { value: m.status }));
  }
  const need = ROLE_FOR[m.status];
  if (m.list) {
    const l = meta.lists.find((x) => x.title === m.list);
    if (!l) out.push(finding('UNKNOWN_LIST', keyLine.list ?? null, { list: m.list }));
    else if (need && l.workflowRole !== need) out.push(finding('LIST_STATUS_MISMATCH', keyLine.list ?? null, { list: m.list, status: m.status }));
  }
  // cycle 008: a missing START/ACTIVE/END role is repaired by the server on accept.
  // A named list that does not exist or does not fit is still an error above.
  const users = new Set(meta.members.map((x) => x.username));
  for (const u of m.members) if (!users.has(u)) out.push(finding('UNKNOWN_MEMBER', keyLine.members ?? null, { username: u }));
  const names = new Set(meta.labels.map((x) => x.name));
  for (const l of m.labels) if (!names.has(l)) out.push(finding('UNKNOWN_LABEL', keyLine.labels ?? null, { label: l }));
  for (const c of m.checklists) {
    for (const i of c.items) {
      if (i.assignee && !users.has(i.assignee)) out.push(finding('UNKNOWN_MEMBER', null, { username: i.assignee }));
    }
  }
  return out;
}
