import { parseChecklist } from './checklists';
import { finding } from './codes';
import { parseDecision } from './decisions';
import type { ChecklistModel, DecisionModel, Finding, RefModel } from './model';
import { parseRefs, type Line } from './refs';

export interface ParsedBody {
  description: string;
  refs: RefModel[];
  hasRefsSection: boolean;
  decisions: DecisionModel[];
  checklists: ChecklistModel[];
  findings: Finding[];
  /** every rodo id comment with its file line (ID_DUPLICATE) */
  ids: { id: string; no: number }[];
}

type Block = { kind: 'refs' | 'decision' | 'checklist'; header: Line; rest: string; lines: Line[] };

/** `lines` are the file lines after the frontmatter; `firstNo` is the file line number of lines[0]. */
export function parseBody(lines: string[], firstNo: number): ParsedBody {
  const findings: Finding[] = [];
  const desc: string[] = [];
  const blocks: Block[] = [];
  let fence = false;
  let order = { refs: 0, decision: 0, checklist: 0 };

  lines.forEach((text, i) => {
    const no = firstNo + i;
    if (/^\s*(```|~~~)/.test(text)) fence = !fence;
    let kind: Block['kind'] | null = null;
    let rest = '';
    if (!fence) {
      if (text.trimEnd() === '## Refs') kind = 'refs';
      else if (text.startsWith('## Decision: ')) { kind = 'decision'; rest = text.slice('## Decision: '.length); }
      else if (text.startsWith('## Checklist: ')) { kind = 'checklist'; rest = text.slice('## Checklist: '.length); }
    }
    if (kind) {
      const bad =
        (kind === 'refs' && (order.refs > 0 || order.decision > 0 || order.checklist > 0)) ||
        (kind === 'decision' && order.checklist > 0);
      if (bad) findings.push(finding('SECTION_ORDER', no));
      order[kind]++;
      blocks.push({ kind, header: { text, no }, rest, lines: [] });
    } else if (blocks.length) blocks[blocks.length - 1]!.lines.push({ text, no });
    else desc.push(text);
  });

  while (desc.length && !desc[0]!.trim()) desc.shift();
  while (desc.length && !desc[desc.length - 1]!.trim()) desc.pop();
  const description = desc.join('\n');
  if (description.length > 8000) findings.push(finding('DESCRIPTION_TOO_LONG', null, { n: description.length }));

  const out: ParsedBody = { description, refs: [], hasRefsSection: false, decisions: [], checklists: [], findings, ids: [] };
  for (const b of blocks) {
    if (b.kind === 'refs') {
      out.hasRefsSection = true;
      const r = parseRefs(b.lines);
      out.refs.push(...r.refs);
      findings.push(...r.findings);
      out.ids.push(...r.ids);
    } else if (b.kind === 'decision') {
      const d = parseDecision(b.rest, b.header.no, b.lines);
      out.decisions.push(d.decision);
      findings.push(...d.findings);
      out.ids.push(...d.ids);
    } else {
      const c = parseChecklist(b.rest, b.header.no, b.lines);
      out.checklists.push(c.checklist);
      findings.push(...c.findings);
      out.ids.push(...c.ids);
    }
  }
  if (out.decisions.length > 5) findings.push(finding('DECISION_LIMIT_REACHED', null));
  return out;
}
