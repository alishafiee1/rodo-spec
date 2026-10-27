import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../src/commands/doctor';
import { runResume } from '../src/commands/resume';
import { runStatus } from '../src/commands/status';
import { runSync } from '../src/commands/sync';
import { runValidate } from '../src/commands/validate';
import { runVersion } from '../src/commands/version';
import { addCycle, cardText, exec, initProject, tempRepo } from './helpers/temp-repo';

const VOLATILE = new Set(['startedAt', 'finishedAt', 'at', 'lastSyncAt', 'head', 'branch', 'durationMs']);
/** R9: --json output is stable. Times, commit ids and machine versions are replaced so the snapshot can be committed. */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, VOLATILE.has(k) && x !== null ? '<volatile>' : stable(x)]));
  }
  return typeof v === 'string' ? v.replace(/\d{4}-\d{2}-\d{2}/g, '<date>').replace(/Node \d+\.\d+\.\d+/, 'Node <v>').replace(/\d+\.\d+\.\d+$/, '<v>') : v;
}

async function fixture() {
  const repo = tempRepo();
  await initProject(repo);
  repo.write('rodo/shop/MAP.md', '# Map\n\n## این پروژه چیست\n\nA flower shop.\n\n## الان کجاییم\n\nCart done.\n');
  addCycle(repo, 'shop', '004-order-cancel', cardText({ extraFm: 'id: clx9n4c5d0002gm01discnt2' }) + '\n## Decision: Cancel paid orders too?\n\n- A: yes\n- B: only unpaid\n');
  addCycle(repo, 'shop', '003-gift-wrap', cardText({ status: 'doing', folder: '003-gift-wrap', title: 'Gift wrap' }));
  return repo;
}

describe('--json snapshots (R9)', () => {
  it('validate', async () => {
    const repo = await fixture();
    expect(stable((await exec(repo, (c) => runValidate(c, []), { json: true })).json())).toMatchSnapshot();
  });
  it('status', async () => {
    const repo = await fixture();
    expect(stable((await exec(repo, (c) => runStatus(c, { local: true }), { json: true })).json())).toMatchSnapshot();
  });
  it('resume', async () => {
    const repo = await fixture();
    expect(stable((await exec(repo, (c) => runResume(c, '004', { full: true }), { json: true })).json())).toMatchSnapshot();
  });
  it('sync --offline', async () => {
    const repo = await fixture();
    expect(stable((await exec(repo, (c) => runSync(c, { offline: true }), { json: true })).json())).toMatchSnapshot();
  });
  it('doctor', async () => {
    const repo = await fixture();
    const j = (await exec(repo, (c) => runDoctor(c), { json: true })).json();
    expect(stable(j)).toMatchSnapshot();
  });
  it('version', async () => {
    const repo = await fixture();
    expect(stable((await exec(repo, (c) => runVersion(c), { json: true })).json())).toMatchSnapshot();
  });
});

// the real binary, when it has been built (pnpm --filter @rodo/cli build)
const bin = join(__dirname, '../dist/index.js');
describe.skipIf(!existsSync(bin))('built binary', () => {
  it('prints its version and runs doctor in a fresh repo', async () => {
    const repo = tempRepo();
    const run = (...a: string[]) => execFileSync('node', [bin, ...a], { cwd: repo.root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    expect(run('version')).toMatch(/^rodo \d/);
    run('init', '--method-only', '--project', 'shop', '--yes-files');
    expect(repo.exists('rodo/shop/project.json')).toBe(true);
    expect(run('doctor')).toContain('OK   kit');
    expect(JSON.parse(run('validate', '--json')).version).toBe(2);
  });

  it('exits 3 outside a RODO repo and 2 on a usage error', () => {
    const repo = tempRepo();
    const code = (...a: string[]) => {
      try { execFileSync('node', [bin, ...a], { cwd: repo.root, stdio: 'pipe' }); return 0; } catch (e) { return (e as { status: number }).status; }
    };
    expect(code('validate')).toBe(3);
    expect(code('init', '--method-only', '--project', 'Bad Slug')).toBe(2);
    expect(code('nonsense')).toBe(2);
  });
});
