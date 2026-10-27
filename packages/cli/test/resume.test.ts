import { describe, expect, it } from 'vitest';
import { runResume } from '../src/commands/resume';
import { runStatus } from '../src/commands/status';
import { addCycle, cardText, exec, initProject, tempRepo } from './helpers/temp-repo';

const DECISION = '\n## Decision: Cancel paid orders too?\n\n- A: yes\n- B: only unpaid\n';
const ID = 'clx9n4c5d0002gm01discnt2';

async function project(opts: { lastSyncMsAgo?: number } = {}) {
  const repo = tempRepo();
  await initProject(repo);
  repo.write('rodo/shop/MAP.md', '# Map\n\n## این پروژه چیست\n\nA flower shop.\n\n## الان کجاییم\n\nCart done.\n');
  repo.write('rodo/shop/MEMORY.md', '# Memory\n\n- m1\n- m2\n- m3\n- m4\n- m5\n- m6\n');
  if (opts.lastSyncMsAgo !== undefined) repo.write('rodo/shop/.rodo/last-sync.json', JSON.stringify({ finishedAt: Date.now() - opts.lastSyncMsAgo, mode: 'offline' }));
  return repo;
}

describe('rodo resume (R6)', () => {
  it('prints the compact format for the active card with the open decision', async () => {
    const repo = await project({ lastSyncMsAgo: 180_000 });
    addCycle(repo, 'shop', '004-order-cancel', cardText({ extraFm: `id: ${ID}\nscope:\n  allowed: [src/orders]\n  forbidden: [src/billing]\ntest:\n  adapter: api\n  command: "pnpm test {NNN}"` }) + DECISION);
    const r = await exec(repo, (ctx) => runResume(ctx, undefined, {}));
    expect(r.code).toBe(0);
    expect(r.stdout.startsWith('RODO CONTEXT (compact)')).toBe(true);
    expect(r.stdout).toContain('project shop');
    expect(r.stdout).toContain('last sync 3 min ago');
    expect(r.stdout).toMatch(/DECISIONS\s+open: "Cancel paid orders too\?" \(A yes, B only unpaid\)/);
    expect(r.stdout).toMatch(/PROJECT\s+A flower shop\./);
    expect(r.stdout).toMatch(/WHERE\s+Cart done\./);
    expect(r.stdout).toMatch(/CARD\s+004 — Order cancel\s+status: in_progress\s+path: rodo\/shop\/cycles\/004-order-cancel\/card\.rodo\.md/);
    expect(r.stdout).toMatch(/SCOPE\s+allowed: src\/orders\s+forbidden: src\/billing/);
    expect(r.stdout).toMatch(/TEST\s+pnpm test \{NNN\} \(adapter api\)/);
    expect(r.stdout).toMatch(/DONE\s+API/);
    expect(r.stdout).toMatch(/REMAINING\s+button/);
    expect(r.stdout).toMatch(/DECISIONS-MEM\s+- m2/);
    expect(r.stdout).not.toContain('- m1');
    expect(r.stdout).toContain('/rodo/shop/cycles/004-order-cancel/simple.md');
    expect(r.stdout).toContain('rodo sync');
  });

  it('shows an answered decision, a blocker and the workflow only when set', async () => {
    const repo = await project();
    const t = cardText({ status: 'blocked', extraFm: 'statusReason: waiting for the owner\nblockerType: decision\nworkflow: standard' })
      + '\n## Decision: Cancel paid orders too?\n\n- A: yes\n- B: only unpaid\n- Answer: B — only for now\n';
    addCycle(repo, 'shop', '004-order-cancel', t);
    const r = await exec(repo, (ctx) => runResume(ctx, undefined, {}));
    expect(r.stdout).toContain('status: blocked (decision)   workflow: standard');
    expect(r.stdout).toMatch(/BLOCKER\s+waiting for the owner/);
    expect(r.stdout).toContain('answered: "Cancel paid orders too?" → B — only for now');
    const plain = await project();
    addCycle(plain, 'shop', '004-order-cancel', cardText());
    expect((await exec(plain, (ctx) => runResume(ctx, undefined, {}))).stdout).not.toContain('workflow:');
  });

  it('says APPROVAL: waiting when an [approval] step is unticked', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-order-cancel', cardText() + '\n## Checklist: Review\n\n- [ ] Owner approves the design [approval]\n- [ ] Write the code\n');
    const r = await exec(repo, (ctx) => runResume(ctx, undefined, {}));
    expect(r.stdout).toMatch(/APPROVAL\s+waiting for the user \(do not code\)/);
    expect(r.stdout).toContain('Write the code');
  });

  it('picks the single blocked card when nothing is in progress', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-order-cancel', cardText({ status: 'blocked', extraFm: 'statusReason: stuck\nblockerType: technical' }));
    addCycle(repo, 'shop', '005-done', cardText({ status: 'done', folder: '005-done' }));
    expect((await exec(repo, (ctx) => runResume(ctx, undefined, {}))).stdout).toContain('004 — Order cancel');
  });

  it('several in_progress cards: lists them and exits 2', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-a', cardText({ title: 'A', folder: '004-a' }));
    addCycle(repo, 'shop', '005-b', cardText({ title: 'B', folder: '005-b' }));
    await expect(exec(repo, (ctx) => runResume(ctx, undefined, {}))).rejects.toMatchObject({ exitCode: 2, message: expect.stringContaining('005') });
  });

  it('no active card: exit 2', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-a', cardText({ status: 'done', folder: '004-a' }));
    await expect(exec(repo, (ctx) => runResume(ctx, undefined, {}))).rejects.toMatchObject({ exitCode: 2 });
  });

  it('takes a card by number, folder or the last 8 characters of its id', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-a', cardText({ title: 'A', folder: '004-a', extraFm: `id: ${ID}` }));
    addCycle(repo, 'shop', '005-b', cardText({ title: 'B', status: 'todo', folder: '005-b' }));
    for (const q of ['005', '5', '005-b']) expect((await exec(repo, (ctx) => runResume(ctx, q, {}))).stdout).toContain('005 — B');
    expect((await exec(repo, (ctx) => runResume(ctx, ID.slice(-8), {}))).stdout).toContain('004 — A');
  });

  it('hints when the last sync is older than an hour or missing', async () => {
    const old = await project({ lastSyncMsAgo: 2 * 3_600_000 });
    addCycle(old, 'shop', '004-a', cardText({ folder: '004-a' }));
    expect((await exec(old, (ctx) => runResume(ctx, undefined, {}))).stdout).toContain('HINT');
    const fresh = await project({ lastSyncMsAgo: 60_000 });
    addCycle(fresh, 'shop', '004-a', cardText({ folder: '004-a' }));
    expect((await exec(fresh, (ctx) => runResume(ctx, undefined, {}))).stdout).not.toContain('HINT');
  });

  it('--full adds simple.md, spec.md, acceptance.feature and architecture.md, cut at 400 lines', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }), { 'spec.md': 'SPEC BODY\n', 'acceptance.feature': 'Feature: F\n' });
    repo.write('rodo/shop/cycles/004-a/simple.md', Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
    repo.write('rodo/shop/project/architecture.md', 'ARCH BODY\n');
    const full = await exec(repo, (ctx) => runResume(ctx, undefined, { full: true }));
    expect(full.stdout).toContain('SPEC BODY');
    expect(full.stdout).toContain('Feature: F');
    expect(full.stdout).toContain('ARCH BODY');
    expect(full.stdout).toContain('line 400');
    expect(full.stdout).not.toContain('line 401');
    expect((await exec(repo, (ctx) => runResume(ctx, undefined, {}))).stdout).not.toContain('SPEC BODY');
  });

  it('--json carries the same fields', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }) + DECISION);
    const j = (await exec(repo, (ctx) => runResume(ctx, undefined, {}), { json: true })).json();
    expect(j.card).toMatchObject({ key: '004-a', status: 'in_progress' });
    expect(j.fields.DECISIONS).toContain('open:');
  });
});

describe('rodo status --local', () => {
  it('lists cards with local state and counts what waits for the user', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-a', cardText({ title: 'A', folder: '004-a' }) + DECISION + '\n## Checklist: Review\n\n- [ ] Approve [approval]\n');
    addCycle(repo, 'shop', '003-b', cardText({ title: 'B', status: 'doing', folder: '003-b' }));
    const r = await exec(repo, (ctx) => runStatus(ctx, { local: true }), { lang: 'en' });
    expect(r.stdout).toMatch(/004 A\s+—\s+in_progress\s+not-bound/);
    expect(r.stdout).toMatch(/003 B\s+—\s+—\s+invalid \(1 error\)/);
    expect(r.stdout).toContain('waiting for your decision: 1');
    expect(r.stdout).toContain('waiting for approval: 1');
    expect(r.stdout).toMatch(/branch main @ [0-9a-f]{7}/);
  });

  it('uses Persian for the waiting lines when the project language is fa, English with --lang en', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }) + DECISION);
    expect((await exec(repo, (ctx) => runStatus(ctx, {}))).stdout).toContain('منتظر تصمیم شما: 1');
    expect((await exec(repo, (ctx) => runStatus(ctx, {}), { lang: 'en' })).stdout).toContain('waiting for your decision: 1');
  });

  it('reads sync states from state.json when the project is bound', async () => {
    const repo = await project();
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, boardId: 'clxboard' }));
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', extraFm: `id: ${ID}` }));
    addCycle(repo, 'shop', '005-b', cardText({ folder: '005-b', title: 'B' }));
    const { sha256 } = await import('../src/core/fs-atomic');
    const { readFileSync } = await import('node:fs');
    const hash = sha256(readFileSync(`${repo.root}/rodo/shop/cycles/004-a/card.rodo.md`));
    repo.write('rodo/shop/.rodo/state.json', JSON.stringify({ cards: { [ID]: { path: 'cycles/004-a/card.rodo.md', fileHash: hash } } }));
    let r = await exec(repo, (ctx) => runStatus(ctx, {}), { json: true });
    const states = () => Object.fromEntries(r.json().projects[0].cards.map((c: { key: string; sync: string }) => [c.key, c.sync]));
    expect(states()).toEqual({ '004-a': 'clean', '005-b': 'local-new' });
    repo.write('rodo/shop/cycles/004-a/card.rodo.md', repo.read('rodo/shop/cycles/004-a/card.rodo.md').replace('Order cancel', 'Order cancel 2'));
    r = await exec(repo, (ctx) => runStatus(ctx, {}), { json: true });
    expect(states()['004-a']).toBe('local-changed');
  });
});

describe('resume hints (dogfood #11)', () => {
  it('a bound project that never synced says "never", not "older than an hour"', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, serverUrl: 'http://127.0.0.1:9', boardId: 'b1' }));
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }));
    const r = await exec(repo, (ctx) => runResume(ctx, '004', {}), { lang: 'en' });
    expect(r.stdout).toContain('never been synced');
    expect(r.stdout).not.toContain('older than 1 hour');
  });
});
