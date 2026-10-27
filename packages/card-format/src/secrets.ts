// ref/15 §5 --- reports kind + line, never the value ---

export interface SecretHit { kind: string; line: number; /** true = low-confidence match inside code (warning) */ possible: boolean }

const HIGH: [string, RegExp][] = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['aws-key', /AKIA[0-9A-Z]{16}/],
  ['github-token', /gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}/],
  ['rodo-token', /rodo_dev_[A-Za-z0-9_-]{40,}/],
  ['openai-like', /sk-[A-Za-z0-9_-]{32,}/],
  ['slack', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['url-credentials', /[a-z]+:\/\/[^/\s:@]+:[^/\s@]+@/i],
];
const ASSIGNMENT = /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?[^\s'"]{8,}/i;

function inlineCodeRanges(line: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /(`+)(.+?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push([m.index, m.index + m[0].length]);
  return out;
}

export function scanSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  let fence: { example: boolean } | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    const f = /^\s*(```|~~~)\s*(.*)$/.exec(line);
    if (f) {
      fence = fence ? null : { example: /example/i.test(f[2]!) };
      return;
    }
    const code = inlineCodeRanges(line);
    const inCode = (idx: number) => !!fence || code.some(([a, b]) => idx >= a && idx < b);
    const assign = ASSIGNMENT.exec(line);
    const assignCovers = (idx: number) => !!assign && idx >= assign.index && idx < assign.index + assign[0].length;
    let assignHandled = false;
    for (const [kind, re] of HIGH) {
      const m = re.exec(line);
      if (!m) continue;
      // an `token = <value>` example written as code is the assignment form: warning only (R7b)
      if (inCode(m.index) && assignCovers(m.index) && kind !== 'private-key') {
        if (!fence?.example) hits.push({ kind: 'assignment', line: n, possible: true });
        assignHandled = true;
        continue;
      }
      hits.push({ kind, line: n, possible: false });
    }
    if (assign && !assignHandled) {
      if (inCode(assign.index)) {
        if (!fence?.example) hits.push({ kind: 'assignment', line: n, possible: true });
      } else hits.push({ kind: 'assignment', line: n, possible: false });
    }
  });
  return hits;
}
