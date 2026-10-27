import { finding } from './codes';
import { parseHours } from './fields';
import type { ChecklistModel, Finding, ItemModel } from './model';
import { ID_COMMENT, type Line } from './refs';

const ITEM = /^- \[( |x|X)\] (.*)$/;
const USERNAME = /^[a-z0-9_.-]{3,32}$/;

export function parseChecklist(rest: string, headerNo: number, lines: Line[]): {
  checklist: ChecklistModel; findings: Finding[]; ids: { id: string; no: number }[];
} {
  const findings: Finding[] = [];
  const ids: { id: string; no: number }[] = [];
  const checklist: ChecklistModel = { title: '', items: [] };
  let title = rest;
  const c = /\s*<!-- rodo:chk_(\S+?) -->\s*$/.exec(rest);
  if (c) {
    title = rest.slice(0, c.index);
    if (ID_COMMENT.test(c[1]!)) { checklist.id = c[1]; ids.push({ id: c[1]!, no: headerNo }); }
    else findings.push(finding('ID_INVALID', headerNo));
  }
  checklist.title = title.trim();
  if (checklist.title.length < 1 || checklist.title.length > 120) findings.push(finding('CHECKLIST_TITLE_INVALID', headerNo, { n: headerNo }));

  for (const { text, no } of lines) {
    if (!text.trim() || /^\s*<!--.*-->\s*$/.test(text)) continue; // a whole-line HTML comment is guidance, not content
    const m = ITEM.exec(text);
    if (!m) { findings.push(finding('ITEM_LINE_INVALID', no, { n: no })); continue; }
    const item: ItemModel = { title: '', isDone: m[1] !== ' ', assignee: null, minutes: 0, kind: 'task' };
    let body = m[2]!;
    const ic = /\s*<!-- rodo:ckl_(\S+?) -->\s*$/.exec(body);
    if (ic) {
      body = body.slice(0, ic.index);
      if (ID_COMMENT.test(ic[1]!)) { item.id = ic[1]; ids.push({ id: ic[1]!, no }); }
      else findings.push(finding('ID_INVALID', no));
    }
    let hasHours = false;
    let bad = false;
    for (;;) {
      let t: RegExpExecArray | null;
      if ((t = /\s*\[approval(:\s*[^\]]*)?\]\s*$/.exec(body))) {
        item.kind = 'approval';
        if (t[1]) findings.push(finding('APPROVAL_HASH_LEGACY', no));
      } else if ((t = /\s*\[hours:\s*([^\]]*)\]\s*$/.exec(body))) {
        hasHours = true;
        const h = parseHours(t[1]!);
        if (h === null) { findings.push(finding('HOURS_INVALID', no, { value: t[1]!.trim() })); bad = true; } else item.minutes = h;
      } else if ((t = /\s+@(\S+)\s*$/.exec(body))) {
        if (USERNAME.test(t[1]!)) item.assignee = t[1]!;
        else { findings.push(finding('ITEM_LINE_INVALID', no, { n: no })); bad = true; }
      } else break;
      body = body.slice(0, t.index);
    }
    item.title = body.trim();
    if (item.title.length < 1 || item.title.length > 200) { findings.push(finding('ITEM_TITLE_INVALID', no, { n: no })); continue; }
    if (item.kind === 'approval' && (item.assignee || hasHours)) findings.push(finding('APPROVAL_ITEM_INVALID', no));
    if (!bad) checklist.items.push(item);
  }
  return { checklist, findings, ids };
}
