import { describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init';
import { exec, snapshotTree, tempRepo } from './helpers/temp-repo';

const init = (repo: ReturnType<typeof tempRepo>, a: Parameters<typeof runInit>[1], answers: string[] = []) => exec(repo, (ctx) => runInit(ctx, a), { answers });

describe('rodo init --method-only', () => {
  it('installs the kit, the project folder, the AGENTS block and .gitignore', async () => {
    const repo = tempRepo();
    const r = await init(repo, { project: 'shop', methodOnly: true, yesFiles: true });
    expect(r.code).toBe(0);
    expect(repo.exists('.agents/skills/rodo/SKILL.md')).toBe(true);
    expect(JSON.parse(repo.read('rodo/kit.json')).kitVersion).toBe('2.2.0');
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    expect(pj).toMatchObject({ schemaVersion: 2, projectSlug: 'shop', boardId: null, repoFingerprint: null });
    for (const f of ['MAP.md', 'MEMORY.md', 'RULES.md', 'CHANGELOG.md', 'project/brief.md', 'project/architecture.md', 'project/glossary.md']) {
      expect(repo.exists(`rodo/shop/${f}`)).toBe(true);
    }
    expect(repo.read('AGENTS.md')).toContain('<!-- rodo:start -->');
    expect(repo.read('CLAUDE.md')).toContain('<!-- rodo:start -->');
    const gi = repo.read('.gitignore');
    for (const l of ['rodo/*/.rodo/', 'rodo/*/inbox/']) expect(gi).toContain(l);
    // no board yet: card files stay in git (dogfood #7)
    expect(gi).not.toContain('rodo/**/*.rodo.md');
    expect(r.stdout).toContain('card files (*.rodo.md) are committed too');
    expect(r.stdout).toContain('rodo new');
  });

  it('R2: project-owned files are never overwritten, and a second run changes nothing', async () => {
    const repo = tempRepo();
    await init(repo, { project: 'shop', methodOnly: true, yesFiles: true });
    repo.write('rodo/shop/MAP.md', 'my own map\n');
    repo.write('rodo/shop/project.json', JSON.stringify({ ...JSON.parse(repo.read('rodo/shop/project.json')), name: 'Mine' }));
    const before = snapshotTree(repo.root);
    const r = await init(repo, { project: 'shop', methodOnly: true, yesFiles: true });
    expect(r.code).toBe(0);
    expect(snapshotTree(repo.root)).toEqual(before);
    expect(repo.read('rodo/shop/MAP.md')).toBe('my own map\n');
  });

  it('keeps the rest of an existing AGENTS.md and adds the block once', async () => {
    const repo = tempRepo();
    repo.write('AGENTS.md', '# Mine\n\nDo not delete this.\n');
    await init(repo, { project: 'shop', methodOnly: true, yesFiles: true });
    await init(repo, { project: 'shop', methodOnly: true, yesFiles: true });
    const t = repo.read('AGENTS.md');
    expect(t).toContain('Do not delete this.');
    expect(t.match(/<!-- rodo:start -->/g)).toHaveLength(1);
  });

  it('replaces only the marked block and keeps CRLF', async () => {
    const repo = tempRepo();
    repo.write('AGENTS.md', 'top\r\n<!-- rodo:start -->\r\nold text\r\n<!-- rodo:end -->\r\nbottom\r\n');
    await init(repo, { project: 'shop', methodOnly: true, yesFiles: true });
    const t = repo.read('AGENTS.md');
    expect(t.startsWith('top\r\n')).toBe(true);
    expect(t.endsWith('\r\nbottom\r\n')).toBe(true);
    expect(t).not.toContain('old text');
    expect(t).not.toMatch(/[^\r]\n/);
  });

  it('--dry-run writes nothing', async () => {
    const repo = tempRepo();
    const before = snapshotTree(repo.root);
    const r = await init(repo, { project: 'shop', methodOnly: true, dryRun: true });
    expect(r.code).toBe(0);
    expect(snapshotTree(repo.root)).toEqual(before);
  });

  it('asks for the slug when --project is missing and suggests the folder name', async () => {
    const repo = tempRepo();
    await init(repo, { methodOnly: true, yesFiles: true }, ['flower-shop']);
    expect(repo.exists('rodo/flower-shop/project.json')).toBe(true);
  });

  it('rejects a bad or reserved slug (exit 2)', async () => {
    const repo = tempRepo();
    for (const slug of ['Bad Slug', 'kit', 'a']) {
      await expect(init(repo, { project: slug, methodOnly: true })).rejects.toMatchObject({ exitCode: 2 });
    }
    expect(repo.exists('rodo/Bad Slug')).toBe(false);
  });

  it('refuses server flags together with --method-only (exit 2)', async () => {
    await expect(init(tempRepo(), { project: 'shop', methodOnly: true, connect: 'RODO-AAAA-BBBB' })).rejects.toMatchObject({ exitCode: 2 });
  });

  it('works without git and says NO_GIT', async () => {
    const repo = tempRepo({ git: false });
    const r = await init(repo, { project: 'shop', methodOnly: true, yesFiles: true });
    expect(r.stdout).toContain('NO_GIT');
    expect(repo.exists('rodo/shop/project.json')).toBe(true);
  });

  it('leaves .gitignore alone when the user says no', async () => {
    const repo = tempRepo();
    await init(repo, { project: 'shop', methodOnly: true }, ['no']);
    expect(repo.exists('.gitignore')).toBe(false);
  });
});
