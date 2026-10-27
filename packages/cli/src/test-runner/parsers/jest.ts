import { stripAnsi, type Failure } from './generic';

interface JestAssertion { status?: string; fullName?: string; title?: string; failureMessages?: string[] }
interface JestFile { assertionResults?: JestAssertion[]; message?: string; status?: string }

/** Jest `--json` -> first failed assertion. */
export function parseJest(json: string): Failure | null {
  let data: { testResults?: JestFile[] };
  try { data = JSON.parse(json) as { testResults?: JestFile[] }; } catch { return null; }
  for (const file of data.testResults ?? []) {
    const a = (file.assertionResults ?? []).find((x) => x.status === 'failed');
    if (a) {
      const lines = stripAnsi(a.failureMessages?.[0] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      const name = a.fullName ?? a.title ?? '';
      return {
        scenario: /@R\d+/.exec(name)?.[0] ?? name,
        step: '',
        errorType: /^([A-Za-z]*Error)\b/.exec(lines[0] ?? '')?.[1] ?? 'AssertionError',
        message: lines.slice(0, 3).join(' ') || 'test failed',
      };
    }
    if (file.status === 'failed' && file.message) {
      const lines = stripAnsi(file.message).split('\n').map((l) => l.trim()).filter(Boolean);
      return { scenario: '', step: '', errorType: 'SuiteError', message: lines.slice(0, 3).join(' ') };
    }
  }
  return null;
}
