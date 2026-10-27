export interface Failure { scenario: string; step: string; errorType: string; message: string }

// eslint-disable-next-line no-control-regex
export const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

/** Runner summary and wrapper lines: the same for every failure, so they must never be the signature (dogfood #16). */
const SUMMARY = [
  /^#\s*(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/i, // node:test / TAP footer
  /^(Tests?|Test Files|Test Suites|Suites|Snapshots):?\s/i, // vitest / jest footer
  /^\d+\s+(passing|failing|pending)\b/i, // mocha
  /^(npm (ERR!|error)|ELIFECYCLE|error Command failed|Command failed with exit code)/i,
  /^(FAILED|failed)$/i,
  /^[-=⎯─_ ]{3,}/, // separators
];
const isSummary = (l: string) => SUMMARY.some((r) => r.test(l));

/** Lines that name the failing test: TAP `not ok N - name`, `FAIL file > name`, `✗ name`, jest `● name`. */
const NAME = [/^not ok \d+\s*-?\s*(.+)$/, /^(?:FAIL|✗|×|✖)\s+(.+)$/, /^●\s+(.+)$/];

/** ref/13 §7 "other": the failing test names and the last real error line, never the runner summary. */
export function parseGeneric(output: string): Failure {
  const lines = stripAnsi(output).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const body = lines.filter((l) => !isSummary(l));
  const names = body.flatMap((l) => {
    for (const r of NAME) {
      const m = r.exec(l);
      if (m) return [m[1]!.replace(/\s+#.*$/, '').trim()];
    }
    return [];
  });
  const errorLine = [...body].reverse().find((l) => /\b[A-Za-z]*Error\b(\s*[:[(]|$)/.test(l) && !NAME.some((r) => r.test(l)));
  const hit = errorLine
    ?? [...body].reverse().find((l) => /(Error|FAIL|failed)/i.test(l))
    ?? names[0]
    ?? body[body.length - 1]
    ?? lines[lines.length - 1]
    ?? 'test command failed';
  const type = /\b([A-Za-z]*Error)\b/.exec(hit)?.[1] ?? (/\bFAIL/i.test(hit) ? 'FAIL' : 'failed');
  return { scenario: [...new Set(names)].slice(0, 5).join(' | '), step: '', errorType: type, message: hit };
}
