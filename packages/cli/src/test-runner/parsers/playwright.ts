import { stripAnsi, type Failure } from './generic';

interface PwError { message?: string; location?: { file?: string; line?: number } }
interface PwStep { title?: string; error?: PwError; steps?: PwStep[] }
interface PwResult { status?: string; error?: PwError; errors?: PwError[]; steps?: PwStep[] }
interface PwSpec { title?: string; tags?: string[]; tests?: { results?: PwResult[] }[] }
interface PwSuite { specs?: PwSpec[]; suites?: PwSuite[] }

const failingStep = (steps: PwStep[] = []): string | null => {
  for (const s of steps) {
    const inner = failingStep(s.steps);
    if (inner) return inner;
    if (s.error) return s.title ?? null;
  }
  return null;
};

function firstFailure(suites: PwSuite[] = []): { spec: PwSpec; res: PwResult } | null {
  for (const su of suites) {
    for (const spec of su.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const res = (t.results ?? []).find((r) => r.status && r.status !== 'passed' && r.status !== 'skipped');
        if (res) return { spec, res };
      }
    }
    const inner = firstFailure(su.suites);
    if (inner) return inner;
  }
  return null;
}

/** Playwright JSON reporter -> first failure. scenario = `@Rn` tag or the title; step = failing step or the expect line. */
export function parsePlaywright(json: string): Failure | null {
  let data: { suites?: PwSuite[] };
  try { data = JSON.parse(json) as { suites?: PwSuite[] }; } catch { return null; }
  const f = firstFailure(data.suites);
  if (!f) return null;
  const title = f.spec.title ?? '';
  const tag = /@R\d+/.exec([title, ...(f.spec.tags ?? [])].join(' '))?.[0];
  const err = f.res.error ?? f.res.errors?.[0] ?? {};
  const msg = stripAnsi(err.message ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const expectLine = msg.find((l) => /expect\(/i.test(l)) ?? msg[0] ?? 'test failed';
  return {
    scenario: tag ?? title,
    step: failingStep(f.res.steps) ?? expectLine,
    errorType: /\b([A-Za-z]*Error)\b/.exec(msg[0] ?? '')?.[1] ?? 'AssertionError',
    message: msg.slice(0, 3).join(' '),
  };
}
