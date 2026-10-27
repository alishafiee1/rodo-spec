import { describe, expect, it } from 'vitest';
import { runTest } from '../src/commands/test';
import { parseGeneric } from '../src/test-runner/parsers/generic';
import { parseJest } from '../src/test-runner/parsers/jest';
import { parsePlaywright } from '../src/test-runner/parsers/playwright';
import { readRuns, setLastFailure, withReporters } from '../src/test-runner/run';
import { signatureOf, streak } from '../src/test-runner/signature';
import { addCycle, cardText, exec, initProject, tempRepo } from './helpers/temp-repo';

const CARD = 'rodo/shop/cycles/004-order-cancel/card.rodo.md';
const FAILING = "console.error('AssertionError: expected 409, got 200 at order-service'); process.exit(1);\n";
// a different failure on every run: the counter lives in a file
const VARYING = [
  "const fs = require('fs');",
  "const n = fs.existsSync('count.txt') ? Number(fs.readFileSync('count.txt', 'utf8')) : 0;",
  "fs.writeFileSync('count.txt', String(n + 1));",
  "const errs = ['AssertionError: alpha broke', 'TypeError: beta is undefined', 'RangeError: gamma out of bounds'];",
  'console.error(errs[n % 3]); process.exit(1);',
].join('\n');

async function project(script: string, extraFm = '') {
  const repo = tempRepo();
  await initProject(repo);
  repo.write('failing.js', script);
  addCycle(repo, 'shop', '004-order-cancel', cardText({ extraFm: `${extraFm}test:\n  adapter: other\n  command: "node failing.js"` }));
  return repo;
}
const run = (repo: ReturnType<typeof tempRepo>, q: string | undefined = '004') => exec(repo, (ctx) => runTest(ctx, q, {}), { json: true });

describe('rodo test (R7)', () => {
  it('prints RODO_STUCK on the second identical failure and never changes the status', async () => {
    const repo = await project(FAILING);
    const first = await run(repo);
    expect(first.code).toBe(1);
    expect(first.json()).toMatchObject({ passed: false, count: 1, stuck: false });
    const human = await exec(repo, (ctx) => runTest(ctx, '004', {}));
    expect(human.stdout).toContain('RODO_STUCK: the same failure happened twice (');
    expect(human.stdout).toContain('set status: blocked, blockerType: test or technical');
    expect(human.code).toBe(1); // the test command's own exit code
    expect(repo.read(CARD)).toContain('status: in_progress');
    expect(repo.read(CARD)).toMatch(/- Last failure: [0-9a-f]{12} ×2 — AssertionError: expected 409, got 200/);
  });

  it('two different failures do not print RODO_STUCK', async () => {
    const repo = await project(VARYING);
    const a = await run(repo);
    const b = await run(repo);
    const c = await run(repo);
    for (const r of [a, b, c]) expect(r.stdout).not.toContain('RODO_STUCK');
    expect(new Set([a, b, c].map((r) => r.json().signature)).size).toBe(3);
    expect(repo.read(CARD)).toMatch(/- Last failure: [0-9a-f]{12} ×1 /);
  });

  it('a pass in between resets the count and writes "Last failure: none"', async () => {
    const repo = await project(FAILING);
    await run(repo);
    repo.write('failing.js', 'process.exit(0);\n');
    const pass = await run(repo);
    expect(pass.code).toBe(0);
    expect(pass.json()).toMatchObject({ passed: true, stuck: false });
    expect(repo.read(CARD)).toContain('- Last failure: none');
    repo.write('failing.js', FAILING);
    expect((await run(repo)).json()).toMatchObject({ count: 1, stuck: false });
  });

  it('records every run in .rodo/runs/<cardKey>.jsonl', async () => {
    const repo = await project(FAILING);
    await run(repo);
    const runs = readRuns(`${repo.root}/rodo/shop`, '004-order-cancel');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ command: 'node failing.js', adapter: 'other', exitCode: 1, passed: false, scenario: '', step: '' });
    expect(runs[0]!.signature).toMatch(/^[0-9a-f]{12}$/);
    expect(runs[0]!.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(runs[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(repo.exists('rodo/shop/.rodo/runs/004-order-cancel.last.txt')).toBe(true);
  });

  it('with no command it says so and exits 0', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-order-cancel', cardText());
    const r = await exec(repo, (ctx) => runTest(ctx, '004', {}), { lang: 'en' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('no test command for this card (tests are optional)');
  });

  it('falls back to the project testCommand with {NNN} replaced', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, testCommand: 'node check.js {NNN}' }));
    repo.write('check.js', "process.exit(process.argv[2] === '004' ? 0 : 3);\n");
    addCycle(repo, 'shop', '004-order-cancel', cardText());
    expect((await run(repo)).json()).toMatchObject({ ran: true, passed: true });
  });

  it('the failure signature ignores numbers, ids, paths, dates and ports', () => {
    const f = (message: string) => signatureOf('other', { scenario: '', step: '', errorType: 'Error', message });
    expect(f('timeout after 3000 ms at C:\\Users\\a\\x.ts on port :4321 id 3fa9c0d21b7e4455 at 2026-10-07T11:45:00Z')).toBe(
      f('timeout after 5000 ms at /home/b/y.ts on port :9999 id aabbccddeeff0011 at 2027-01-01T01:00:00Z'),
    );
    expect(f('expected 409, got 200')).not.toBe(f('expected 409, got 500'));
  });

  it('streak counts only consecutive failures with the same signature since the last pass', () => {
    const r = (sig: string | null, passed = false) => ({ signature: sig, passed }) as never;
    expect(streak([], 'a')).toBe(1);
    expect(streak([r('a')], 'a')).toBe(2);
    expect(streak([r('a'), r('b')], 'a')).toBe(1);
    expect(streak([r('a'), r(null, true)], 'a')).toBe(1);
    expect(streak([r('b'), r('a'), r('a')], 'a')).toBe(3);
  });

  it('--json does not stream the test output', async () => {
    const repo = await project(FAILING);
    const r = await run(repo);
    expect(() => r.json()).not.toThrow();
  });
});

describe('parsers', () => {
  it('generic: the last line that looks like an error', () => {
    const f = parseGeneric('start\nError: first\nmore output\nAssertionError: second one\nbye');
    expect(f).toMatchObject({ errorType: 'AssertionError', message: 'AssertionError: second one' });
  });

  it('playwright: scenario from the @R tag, step from the failing step', () => {
    const json = JSON.stringify({ suites: [{ suites: [{ specs: [{ title: 'Cancel unpaid @R2', tests: [{ results: [{ status: 'failed', error: { message: 'Error: expect(received).toBe(expected)\nExpected: 409' }, steps: [{ title: 'click cancel', steps: [{ title: 'expect status 409', error: { message: 'x' } }] }] }] }] }] }] }] });
    expect(parsePlaywright(json)).toMatchObject({ scenario: '@R2', step: 'expect status 409' });
    expect(parsePlaywright('{"suites":[]}')).toBeNull();
    expect(parsePlaywright('not json')).toBeNull();
  });

  it('jest: first failed assertion', () => {
    const json = JSON.stringify({ testResults: [{ assertionResults: [{ status: 'passed' }, { status: 'failed', fullName: 'orders cancel @R1 rejects paid', failureMessages: ['Error: expect(received).toBe(409)\n at x'] }] }] });
    expect(parseJest(json)).toMatchObject({ scenario: '@R1', errorType: 'Error' });
  });

  it('adds JSON reporters only to Playwright and Jest commands without one', () => {
    expect(withReporters('npx playwright test --grep @cycle-4', 'r.json').command).toContain('--reporter=list,json');
    expect(withReporters('npx playwright test --reporter=dot', 'r.json').command).toBe('npx playwright test --reporter=dot');
    expect(withReporters('npx jest orders', 'r.json').command).toContain('--json --outputFile="r.json"');
    expect(withReporters('node failing.js', 'r.json')).toEqual({ command: 'node failing.js', env: {} });
  });
});

describe('Progress notes line', () => {
  const card = '---\nschemaVersion: 2\ntitle: T\nstatus: in_progress\n---\n\nBody\n\n## Progress notes\n\n- Updated: 2026-10-07\n- Done: a\n\n## Refs\n\n- [s](/x)\n';

  it('adds the line at the end of the section', () => {
    const t = setLastFailure(card, 'abc ×1 — boom', true)!;
    expect(t).toContain('- Done: a\n- Last failure: abc ×1 — boom\n\n## Refs');
  });

  it('replaces an existing line and is a no-op when unchanged', () => {
    const once = setLastFailure(card, 'abc ×1 — boom', true)!;
    const twice = setLastFailure(once, 'abc ×2 — boom', true)!;
    expect(twice.match(/Last failure/g)).toHaveLength(1);
    expect(twice).toContain('abc ×2');
    expect(setLastFailure(twice, 'abc ×2 — boom', true)).toBeNull();
  });

  it('creates the section before ## Refs when missing, only for failures', () => {
    const bare = '---\nschemaVersion: 2\ntitle: T\nstatus: todo\n---\n\nBody\n\n## Refs\n\n- [s](/x)\n';
    expect(setLastFailure(bare, 'none', false)).toBeNull();
    const t = setLastFailure(bare, 'abc ×1 — boom', true)!;
    expect(t).toContain('Body\n\n## Progress notes\n\n- Last failure: abc ×1 — boom\n\n## Refs');
  });

  it('keeps CRLF and the RODO_ERROR first line', () => {
    const crlf = '<!-- RODO_ERROR: X -->\r\n' + card.replace(/\n/g, '\r\n');
    const t = setLastFailure(crlf, 'abc ×1 — boom', true)!;
    expect(t.startsWith('<!-- RODO_ERROR: X -->\r\n---\r\n')).toBe(true);
    expect(t).not.toMatch(/[^\r]\n/);
  });
});

describe('generic signature ignores the runner summary (dogfood #16)', () => {
  const tap = (name: string, msg: string) => [
    `not ok 1 - ${name}`, '  ---', `  error: '${msg}'`, `  AssertionError [ERR_ASSERTION]: ${msg}`, '  ...',
    '# tests 2', '# suites 0', '# pass 1', '# fail 1', '# duration_ms 812.4', 'npm error Lifecycle script `test` failed',
  ].join('\n');
  it('two different node:test failures with the same counts get different signatures', () => {
    const a = parseGeneric(tap('rm removes a note (R1)', 'Expected values to be strictly equal'));
    const b = parseGeneric(tap('rm unknown id (R2)', 'Expected 1 got 0'));
    expect(a.message).not.toMatch(/^# fail/);
    expect(a.scenario).toBe('rm removes a note (R1)');
    expect(signatureOf('other', a)).not.toBe(signatureOf('other', b));
  });
  it('the same failure twice still gives the same signature (the stuck rule)', () => {
    const t = tap('rm removes a note (R1)', 'Expected values to be strictly equal');
    expect(signatureOf('other', parseGeneric(t))).toBe(signatureOf('other', parseGeneric(t.replace('812.4', '901.7'))));
  });
  it('vitest/jest footers are not the message', () => {
    const f = parseGeneric(['FAIL test/a.test.ts > adds', 'TypeError: x is undefined', ' Test Files  1 failed (1)', '      Tests  1 failed (3)'].join('\n'));
    expect(f.message).toBe('TypeError: x is undefined');
    expect(f.scenario).toBe('test/a.test.ts > adds');
  });
});
