import { parseBody } from './body';
import { finding, severityOf } from './codes';
import { dateMs, readFields } from './fields';
import { parseFrontmatter, splitCard } from './frontmatter';
import type { CardModel, Finding } from './model';
import { scanSecrets } from './secrets';
import { readLegacyReason } from './status-reason';

export interface ParseInfo {
  eol: '\n' | '\r\n';
  bom: boolean;
  trailingNewline: boolean;
  errorLine: string | null;
  keyLine: Record<string, number>;
  fileUpdatedAt: unknown;
  fileLocked: unknown;
  hasRefsSection: boolean;
  /** frontmatter keys as written */
  keyOrder: string[];
}

export interface ParsedCard {
  model: CardModel | null;
  findings: Finding[];
  info: ParseInfo | null;
}

export const isError = (f: Finding): boolean => severityOf(f.code) !== 'W';

/** Context-free parse + checks. Anything that needs a base, board meta or the disk is in validate.ts. */
export function parseCardFull(text: string): ParsedCard {
  const sp = splitCard(text);
  const findings: Finding[] = [...sp.findings];
  if (sp.fmStart < 0 || sp.fmEnd < 0) return { model: null, findings, info: null };
  const fm = parseFrontmatter(sp.lines, sp.fmStart, sp.fmEnd);
  findings.push(...fm.findings);
  if (fm.findings.length) return { model: null, findings, info: null };

  const f = readFields(fm.data, fm.keyLine, fm.order);
  findings.push(...f.findings);
  const m = f.model;
  const body = parseBody(sp.lines.slice(sp.fmEnd + 1), sp.fmEnd + 2);
  findings.push(...body.findings);
  m.description = body.description;
  m.refs = body.refs;
  m.decisions = body.decisions;
  m.checklists = body.checklists;

  const seen = new Set<string>();
  for (const { id, no } of body.ids) {
    if (seen.has(id)) findings.push(finding('ID_DUPLICATE', no, { id }));
    seen.add(id);
  }

  const kl = (k: string) => fm.keyLine[k] ?? null;
  if (m.schemaVersion === 1 && fm.data.schemaVersion === 1) findings.push(finding('SCHEMA_V1', kl('schemaVersion')));
  if (m.startAt && m.dueAt && (dateMs(m.startAt) ?? 0) > (dateMs(m.dueAt) ?? 0)) findings.push(finding('DATE_RANGE', kl('startAt')));
  if (m.financial.type !== 'none' && m.members.length !== 1) findings.push(finding('FINANCIAL_CARD_SINGLE_MEMBER', kl('financial')));
  const hasItems = m.checklists.some((c) => c.items.length > 0);
  if (f.hoursSet && hasItems) findings.push(finding('CARD_HOURS_WITH_ITEMS', kl('hours')));

  // status reason (G2): key first, then the kit 2.0 Progress-notes line
  const hold = m.status === 'blocked' || m.status === 'cancelled';
  const reasonBad = findings.some((x) => x.code === 'STATUS_REASON_INVALID');
  if (hold && !m.statusReason && !reasonBad) {
    const legacy = readLegacyReason(m.description, m.status);
    if (legacy) { m.statusReason = legacy; findings.push(finding('STATUS_REASON_FROM_NOTES', kl('status'))); }
    else findings.push(finding(m.status === 'blocked' ? 'BLOCKER_REASON_MISSING' : 'CANCEL_REASON_MISSING', kl('status')));
  }
  if (!hold && m.statusReason) findings.push(finding('STATUS_REASON_WITHOUT_HOLD', kl('statusReason')));
  if (m.status === 'blocked' && !m.blockerType && !findings.some((x) => x.code === 'BLOCKER_TYPE_INVALID')) {
    findings.push(finding('BLOCKER_TYPE_MISSING', kl('status')));
  }
  if (m.status !== 'blocked' && m.blockerType) findings.push(finding('BLOCKER_TYPE_WITHOUT_BLOCKED', kl('blockerType')));

  const approvals = m.checklists.flatMap((c) => c.items).filter((i) => i.kind === 'approval');
  if (approvals.length > 1) findings.push(finding('APPROVAL_ITEM_DUPLICATE', null));

  // secrets: the RODO_ERROR line is ours, not the author's
  const scanText = sp.lines.map((l, i) => (i === 0 && sp.errorLine ? '' : l)).join('\n');
  for (const h of scanSecrets(scanText)) {
    findings.push(finding(h.possible ? 'SECRET_POSSIBLE' : 'SECRET_SUSPECTED', h.line, { n: h.line, kind: h.kind }));
  }

  return {
    model: m,
    findings,
    info: {
      eol: sp.eol, bom: sp.bom, trailingNewline: sp.trailingNewline, errorLine: sp.errorLine, keyLine: fm.keyLine,
      fileUpdatedAt: f.fileUpdatedAt, fileLocked: f.fileLocked, hasRefsSection: body.hasRefsSection, keyOrder: fm.order,
    },
  };
}

export function parseCard(text: string): { model: CardModel | null; errors: Finding[]; warnings: Finding[] } {
  const p = parseCardFull(text);
  return { model: p.model, errors: p.findings.filter(isError), warnings: p.findings.filter((x) => !isError(x)) };
}

/** Bytes -> text; invalid UTF-8 becomes ENCODING_INVALID. */
export function decodeCardBytes(bytes: Uint8Array): { text: string; error: Finding | null } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), error: null };
  } catch {
    return { text: '', error: finding('ENCODING_INVALID', null) };
  }
}
