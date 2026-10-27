import { finding } from './codes';
import type { DecisionModel, Finding } from './model';
import { ID_COMMENT, type Line } from './refs';

const OPTION = /^- ([A-Za-z]): ?(.*)$/;
const ANSWER = /^- Answer: ?(.*)$/;
const ANSWER_VALUE = /^([A-F]|other)(?: — (.*))?$/;

/** `rest` is the header text after "## Decision: " */
export function parseDecision(rest: string, headerNo: number, lines: Line[]): {
  decision: DecisionModel; findings: Finding[]; ids: { id: string; no: number }[];
} {
  const findings: Finding[] = [];
  const ids: { id: string; no: number }[] = [];
  const decision: DecisionModel = { question: '', options: [], answer: null };
  let question = rest;
  const c = /\s*<!-- rodo:dec_(\S+?) -->\s*$/.exec(rest);
  if (c) {
    question = rest.slice(0, c.index);
    if (ID_COMMENT.test(c[1]!)) { decision.id = c[1]; ids.push({ id: c[1]!, no: headerNo }); }
    else findings.push(finding('ID_INVALID', headerNo));
  }
  decision.question = question.trim();
  if (decision.question.length < 1 || decision.question.length > 300) findings.push(finding('DECISION_TITLE_INVALID', headerNo, { n: headerNo }));

  const keys = new Set<string>();
  for (const { text, no } of lines) {
    if (!text.trim()) continue;
    const a = ANSWER.exec(text);
    if (a) {
      const v = ANSWER_VALUE.exec(a[1]!.trim());
      if (!v) findings.push(finding('DECISION_LINE_INVALID', no, { n: no }));
      else decision.answer = { key: v[1]!, note: v[2]?.trim() || null };
      continue;
    }
    const o = OPTION.exec(text);
    if (!o) { findings.push(finding('DECISION_LINE_INVALID', no, { n: no })); continue; }
    const t = o[2]!.trim();
    if (!/^[A-F]$/.test(o[1]!) || keys.has(o[1]!) || t.length < 1 || t.length > 200) {
      findings.push(finding('DECISION_OPTION_INVALID', no, { n: no }));
      continue;
    }
    keys.add(o[1]!);
    decision.options.push({ key: o[1]!, text: t });
  }
  if (decision.options.length < 2 || decision.options.length > 6) findings.push(finding('DECISION_OPTIONS_COUNT', headerNo));
  return { decision, findings, ids };
}
