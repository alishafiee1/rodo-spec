import { describe, expect, it } from 'vitest';
import { runDoctor } from '../src/commands/doctor';
import { addCycle, cardText, exec, initProject, legacyRepo, snapshotTree, tempRepo } from './helpers/temp-repo';

const checks = async (repo: ReturnType<typeof tempRepo>) =>
  (await exec(repo, (ctx) => runDoctor(ctx), { json: true })).json().checks as { id: string; project: string | null; level: string; message: string; fix?: string }[];
const find = (cs: Awaited<ReturnType<typeof checks>>, id: string, project: string | null = null) => cs.filter((c) => c.id === id && c.project === project);

describe('rodo doctor (R8, local checks)', () => {
  it('a healthy project: OK lines, server checks SKIP, exit 0', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const r = await exec(repo, (ctx) => runDoctor(ctx));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/OK\s+node/);
    expect(r.stdout).toContain('SKIP server (not connected)');
    expect(r.stdout).toContain('SKIP credentials (not connected)');
    expect(r.stdout).not.toMatch(/FAIL/);
    const cs = await checks(repo);
    expect(find(cs, 'kit')[0]!.level).toBe('OK');
    expect(find(cs, 'gitignore')[0]!.level).toBe('OK');
    expect(find(cs, 'layout', 'shop')[0]!.level).toBe('OK');
    expect(find(cs, 'testCommand', 'shop')[0]!.level).toBe('INFO');
  });

  it('is read-only', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-a', cardText({ status: 'doing', folder: '004-a' }));
    const before = snapshotTree(repo.root);
    await exec(repo, (ctx) => runDoctor(ctx));
    expect(snapshotTree(repo.root)).toEqual(before);
  });

  it('warns about a missing kit.json and missing .gitignore lines, with a fix', async () => {
    const repo = tempRepo();
    repo.write('rodo/shop/project.json', JSON.stringify({ schemaVersion: 2, projectSlug: 'shop' }));
    const cs = await checks(repo);
    expect(find(cs, 'kit')[0]).toMatchObject({ level: 'WARN', fix: expect.stringContaining('rodo init') });
    expect(find(cs, 'gitignore')[0]).toMatchObject({ level: 'WARN' });
  });

  it('FAILs on a secret with file and line, never printing the value', async () => {
    const repo = tempRepo();
    await initProject(repo);
    repo.write('rodo/shop/MEMORY.md', '# Memory\n\n- ok\n- key AKIAABCDEFGHIJKLMNOP leaked\n');
    const r = await exec(repo, (ctx) => runDoctor(ctx));
    expect(r.stdout).toMatch(/FAIL\s+secrets \[shop\]: rodo\/shop\/MEMORY\.md:4 looks like a secret \(aws-key\)/);
    expect(r.stdout).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(r.code).toBe(0);
  });

  it('also scans simple.md and cards', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }), {});
    repo.write('rodo/shop/cycles/004-a/simple.md', '# x\npassword = hunter2hunter2\n');
    const r = await exec(repo, (ctx) => runDoctor(ctx));
    expect(r.stdout).toContain('rodo/shop/cycles/004-a/simple.md:2');
    expect(r.stdout).not.toContain('hunter2');
  });

  it('counts card errors as a WARN', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-a', cardText({ status: 'doing', folder: '004-a' }));
    expect(find(await checks(repo), 'cards', 'shop')[0]).toMatchObject({ level: 'WARN', message: expect.stringContaining('1 error') });
  });

  it('warns on the legacy layout, kit 1.x leftovers and *.rodo-new files', async () => {
    const repo = legacyRepo();
    repo.write('.githooks/pre-commit', '#!/bin/sh\n');
    repo.write('scripts/rodo-lint.cjs', '//\n');
    repo.write('scripts/rodo-install.cjs', '//\n');
    repo.write('.agents/skills/rodo/coder.md.rodo-new', 'x\n');
    const cs = await checks(repo);
    expect(find(cs, 'layout')[0]!.level).toBe('WARN');
    expect(find(cs, 'legacy-kit-1')[0]!.message).toContain('.githooks/');
    expect(find(cs, 'legacy-kit-2')[0]!.level).toBe('INFO');
    expect(find(cs, 'kit-files')[0]!.level).toBe('WARN');
  });

  it('FAILs on a project.json whose slug does not match the folder', async () => {
    const repo = tempRepo();
    repo.write('rodo/shop/project.json', JSON.stringify({ schemaVersion: 2, projectSlug: 'other' }));
    expect(find(await checks(repo), 'layout', 'shop')[0]).toMatchObject({ level: 'FAIL' });
  });

  it('warns when a card file is tracked by git (bound projects only)', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, serverUrl: 'http://127.0.0.1:9', boardId: 'b1' }));
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }));
    repo.git('add', '-f', 'rodo/shop/cycles/004-a/card.rodo.md');
    repo.commit('track a card');
    expect(find(await checks(repo), 'gitignore').some((c) => c.message.includes('tracked by git'))).toBe(true);
  });

  it('FAILs REPOSITORY_MISMATCH when the stored fingerprint is not this repository', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, repoFingerprint: 'sha256:' + '0'.repeat(64) }));
    expect(find(await checks(repo), 'repository', 'shop')[0]).toMatchObject({ level: 'FAIL', message: expect.stringContaining('REPOSITORY_MISMATCH') });
  });

  it('works in a folder that has no RODO project yet', async () => {
    const r = await exec(tempRepo(), (ctx) => runDoctor(ctx));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/WARN\s+kit/);
  });
});

describe('doctor and method-only cards (dogfood #7)', () => {
  it('a method-only project may keep card files in git: no warning', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }));
    repo.commit('cards in git');
    const g = find(await checks(repo), 'gitignore');
    expect(g.some((c) => c.message.includes('tracked by git'))).toBe(false);
    expect(g[0]!.level).toBe('OK');
  });
});
