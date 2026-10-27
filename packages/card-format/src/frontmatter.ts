import { LineCounter, parseDocument, isMap, isScalar } from 'yaml';
import { finding } from './codes';
import type { Finding } from './model';

export interface SplitCard {
  bom: boolean;
  eol: '\n' | '\r\n';
  /** the original line 1 when it was a RODO_ERROR comment */
  errorLine: string | null;
  /** every line of the file (BOM stripped), 0-based index = file line - 1 */
  lines: string[];
  /** index of the first --- line, or -1 */
  fmStart: number;
  /** index of the closing --- line, or -1 */
  fmEnd: number;
  trailingNewline: boolean;
  findings: Finding[];
}

const ERROR_LINE = /^<!--\s*RODO_ERROR:.*-->\s*$/;

export function splitCard(input: string): SplitCard {
  const findings: Finding[] = [];
  const bom = input.charCodeAt(0) === 0xfeff;
  const text = bom ? input.slice(1) : input;
  if (text.includes('�')) findings.push(finding('ENCODING_INVALID', null));
  const eol: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = /\n$/.test(text);
  const lines = text.split(/\r?\n/);
  if (trailingNewline) lines.pop();
  const line0 = lines[0];
  const errorLine = line0 !== undefined && ERROR_LINE.test(line0) ? line0 : null;
  const first = errorLine ? 1 : 0;
  let fmStart = -1;
  let fmEnd = -1;
  if (lines[first]?.trimEnd() === '---') {
    fmStart = first;
    for (let i = first + 1; i < lines.length; i++) {
      if (lines[i]!.trimEnd() === '---') { fmEnd = i; break; }
    }
    if (fmEnd < 0) findings.push(finding('FRONTMATTER_UNCLOSED', first + 1));
  } else {
    findings.push(finding('FRONTMATTER_MISSING', first + 1));
  }
  return { bom, eol, errorLine, lines, fmStart, fmEnd, trailingNewline, findings };
}

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  /** key order as written */
  order: string[];
  /** 1-based file line of each key */
  keyLine: Record<string, number>;
  findings: Finding[];
}

export function parseFrontmatter(lines: string[], fmStart: number, fmEnd: number): ParsedFrontmatter {
  const findings: Finding[] = [];
  const yamlText = lines.slice(fmStart + 1, fmEnd).join('\n');
  const lc = new LineCounter();
  const doc = parseDocument(yamlText, { version: '1.2', schema: 'core', uniqueKeys: true, lineCounter: lc });
  const base = fmStart + 1; // yaml line 1 = file line fmStart + 2
  for (const err of doc.errors) {
    const yl = err.linePos?.[0]?.line ?? 1;
    findings.push(finding('YAML_INVALID', base + yl, { n: base + yl, detail: err.message.split('\n')[0] }));
  }
  const data: Record<string, unknown> = {};
  const order: string[] = [];
  const keyLine: Record<string, number> = {};
  if (findings.length === 0) {
    const js = doc.toJS();
    if (doc.contents && !isMap(doc.contents) && !(doc.contents === null)) {
      findings.push(finding('YAML_INVALID', base + 1, { n: base + 1, detail: 'frontmatter must be a map of keys' }));
    } else if (js && typeof js === 'object') {
      Object.assign(data, js);
    }
    if (isMap(doc.contents)) {
      for (const pair of doc.contents.items) {
        if (!isScalar(pair.key)) continue;
        const k = String(pair.key.value);
        order.push(k);
        const off = pair.key.range?.[0] ?? 0;
        keyLine[k] = base + lc.linePos(off).line;
      }
    }
  }
  return { data, order, keyLine, findings };
}
