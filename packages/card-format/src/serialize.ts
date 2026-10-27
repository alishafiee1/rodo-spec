import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { CardModel } from './model';
import { splitCard } from './frontmatter';

/** Plain unless YAML needs quotes, or the text has `:`, `#`, a leading `-`, or `—` (ref/11 §10). */
function scalar(s: string, flow = false): string {
  let plain = s !== '' && s === s.trim() && !/[:#\n\r]|^-|—/.test(s) && !(flow && /[,[\]{}]/.test(s));
  if (plain) {
    try { plain = parseYaml(s) === s; } catch { plain = false; }
  }
  return plain ? s : JSON.stringify(s);
}

const flowList = (l: string[]): string => `[${l.map((x) => scalar(x, true)).join(', ')}]`;
export const fmtHours = (min: number): string => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

function frontmatterLines(m: CardModel): string[] {
  const o: string[] = [];
  const kv = (k: string, v: string) => o.push(`${k}: ${v}`);
  kv('schemaVersion', String(m.schemaVersion));
  if (m.id) kv('id', scalar(m.id));
  if (m.tempId) kv('tempId', scalar(m.tempId));
  if (m.boardId) kv('boardId', scalar(m.boardId));
  kv('title', scalar(m.title));
  kv('status', m.status);
  if (m.statusReason) kv('statusReason', scalar(m.statusReason));
  if (m.blockerType) kv('blockerType', m.blockerType);
  if (m.list) kv('list', scalar(m.list));
  if (m.priority !== 'none') kv('priority', m.priority);
  if (m.members.length) kv('members', flowList(m.members));
  if (m.labels.length) kv('labels', flowList(m.labels));
  if (m.startAt) kv('startAt', m.startAt.includes(':') ? JSON.stringify(m.startAt) : m.startAt);
  if (m.dueAt) kv('dueAt', m.dueAt.includes(':') ? JSON.stringify(m.dueAt) : m.dueAt);
  if (m.coverColor) kv('coverColor', m.coverColor);
  if (m.hoursMinutes !== null) kv('hours', fmtHours(m.hoursMinutes));
  const f = m.financial;
  if (f.type !== 'none' || f.amount !== 0 || f.category !== 'general' || f.date) {
    o.push('financial:', `  type: ${f.type}`, `  amount: ${f.amount}`, `  category: ${scalar(f.category)}`);
    if (f.date) o.push(`  date: ${f.date}`);
  }
  if (m.scope) o.push('scope:', `  allowed: ${flowList(m.scope.allowed)}`, `  forbidden: ${flowList(m.scope.forbidden)}`);
  if (m.test) o.push('test:', `  adapter: ${m.test.adapter}`, `  command: ${JSON.stringify(m.test.command)}`);
  if (m.workflow) kv('workflow', m.workflow);
  if (m.updatedAt !== null) kv('updatedAt', String(m.updatedAt));
  if (m.locked) kv('locked', 'true');
  for (const [k, v] of Object.entries(m.extras)) {
    o.push(...stringifyYaml({ [k]: v }).replace(/\n$/, '').split('\n'));
  }
  return o;
}

function bodyLines(m: CardModel): string[] {
  const o: string[] = [];
  const block = (...lines: string[]) => { if (o.length) o.push(''); o.push(...lines); };
  if (m.description) block(...m.description.split('\n'));
  if (m.refs.length) {
    block('## Refs', '');
    for (const r of m.refs) {
      const p = /\s/.test(r.path) ? `<${r.path}>` : r.path;
      o.push(`- [${r.title}](${p})${r.id ? ` <!-- rodo:ref_${r.id} -->` : ''}`);
    }
  }
  for (const d of m.decisions) {
    block(`## Decision: ${d.question}${d.id ? ` <!-- rodo:dec_${d.id} -->` : ''}`, '');
    for (const op of d.options) o.push(`- ${op.key}: ${op.text}`);
    if (d.answer) o.push(`- Answer: ${d.answer.key}${d.answer.note ? ` — ${d.answer.note}` : ''}`);
  }
  for (const c of m.checklists) {
    block(`## Checklist: ${c.title}${c.id ? ` <!-- rodo:chk_${c.id} -->` : ''}`, '');
    for (const i of c.items) {
      o.push(
        `- [${i.isDone ? 'x' : ' '}] ${i.title}` +
          (i.assignee ? ` @${i.assignee}` : '') +
          (i.minutes > 0 ? ` [hours: ${fmtHours(i.minutes)}]` : '') +
          (i.kind === 'approval' ? ' [approval]' : '') +
          (i.id ? ` <!-- rodo:ckl_${i.id} -->` : ''),
      );
    }
  }
  return o;
}

export function serializeCard(m: CardModel, opts: { original?: string; eol?: '\n' | '\r\n' } = {}): string {
  const sp = opts.original !== undefined ? splitCard(opts.original) : null;
  const eol = opts.eol ?? sp?.eol ?? '\n';
  const lines = ['---', ...frontmatterLines(m), '---'];
  const body = bodyLines(m);
  if (body.length) lines.push('', ...body);
  const text = lines.join(eol) + (sp ? (sp.trailingNewline ? eol : '') : eol);
  return (sp?.bom ? '﻿' : '') + text;
}
