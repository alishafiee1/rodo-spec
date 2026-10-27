import { describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init';
import { exec, legacyRepo, snapshotTree } from './helpers/temp-repo';

const migrate = (repo: ReturnType<typeof legacyRepo>, answers: string[], extra: Partial<Parameters<typeof runInit>[1]> = {}) =>
  exec(repo, (ctx) => runInit(ctx, { project: 'shop', methodOnly: true, yesFiles: true, ...extra }), { answers });

describe('legacy layout migration (R3)', () => {
  it('moves kit 2.0 into rodo/<slug>/ and rewrites the links', async () => {
    const repo = legacyRepo();
    const r = await migrate(repo, ['yes']);
    expect(r.code).toBe(0);
    expect(repo.exists('rodo/shop/MAP.md')).toBe(true);
    expect(repo.exists('rodo/MAP.md')).toBe(false);
    expect(repo.read('rodo/shop/cycles/001-x/simple.md')).toContain('(/rodo/shop/cycles/001-x/spec.md)');
    expect(repo.read('rodo/shop/cycles/001-x/card.rodo.md')).toContain('(/rodo/shop/cycles/001-x/simple.md)');
    expect(repo.read('rodo/shop/cycles/001-x/acceptance.feature')).toContain('/rodo/shop/cycles/001-x/spec.md');
    expect(repo.read('rodo/shop/MAP.md')).toContain('(/rodo/shop/cycles/001-x/simple.md)');
  });

  it('converts config.json to project.json and sends kitRepo/kitRef to kit.json', async () => {
    const repo = legacyRepo();
    await migrate(repo, ['yes'], { name: 'Flower shop' });
    expect(JSON.parse(repo.read('rodo/shop/project.json'))).toMatchObject({
      schemaVersion: 2, projectSlug: 'shop', name: 'Flower shop', boardId: null,
      testCommand: 'npx playwright test --grep @cycle-{NNN}', stepsDirs: ['e2e/steps'], language: { simple: 'fa', technical: 'en' },
    });
    expect(JSON.parse(repo.read('rodo/kit.json'))).toMatchObject({ kitRepo: 'https://example.com/kit.git', kitRef: 'main' });
    expect(repo.exists('rodo/config.json')).toBe(false);
  });

  it('copies boardId and serverUrl from .rodo.json and leaves that file', async () => {
    const repo = legacyRepo();
    repo.write('.rodo.json', JSON.stringify({ boardId: 'clx123', serverUrl: 'https://rodo.example' }));
    repo.commit('binding');
    await migrate(repo, ['yes']);
    expect(JSON.parse(repo.read('rodo/shop/project.json'))).toMatchObject({ boardId: 'clx123', serverUrl: 'https://rodo.example' });
    expect(repo.exists('.rodo.json')).toBe(true);
  });

  it('never deletes: every original file still exists, in the old or the new place', async () => {
    const repo = legacyRepo();
    const before = snapshotTree(repo.root);
    await migrate(repo, ['yes']);
    const after = snapshotTree(repo.root);
    const texts = new Set(Object.values(after));
    for (const [path, text] of Object.entries(before)) {
      if (path === 'rodo/config.json' || /AGENTS|CLAUDE/.test(path) || /\.(md|feature)$/.test(path)) continue; // converted or link-rewritten
      expect(texts.has(text) || after[path] !== undefined, path).toBe(true);
    }
    for (const f of ['rodo/MAP.md', 'rodo/MEMORY.md', 'rodo/RULES.md', 'rodo/CHANGELOG.md', 'rodo/project/brief.md', 'rodo/cycles/001-x/spec.md']) {
      expect(repo.exists(f.replace('rodo/', 'rodo/shop/')), f).toBe(true);
    }
    expect(repo.exists('rodo/.kit-version')).toBe(true);
  });

  it('uses git mv for tracked files (history follows)', async () => {
    const repo = legacyRepo();
    await migrate(repo, ['yes']);
    repo.git('add', '-A');
    const status = repo.git('status', '--porcelain');
    expect(status).toMatch(/^R .*rodo\/RULES\.md -> rodo\/shop\/RULES\.md/m);
  });

  it('lists files it did not rewrite, e.g. a Playwright config', async () => {
    const repo = legacyRepo();
    const r = await migrate(repo, ['yes']);
    expect(r.stdout).toContain('frontend/playwright.config.ts');
    expect(repo.read('frontend/playwright.config.ts')).toContain('rodo/cycles/**');
  });

  it('shows the plan and moves nothing without confirmation', async () => {
    const repo = legacyRepo();
    const before = snapshotTree(repo.root);
    const r = await migrate(repo, ['no']);
    expect(r.stdout).toContain('rodo/MAP.md  →  rodo/shop/MAP.md');
    expect(r.stdout).toContain('MIGRATION_CANCELLED');
    expect(repo.exists('rodo/MAP.md')).toBe(true);
    // only the kit step (before the migration) may have written files
    const after = snapshotTree(repo.root);
    for (const [p, t] of Object.entries(before)) if (!/^(AGENTS|CLAUDE)\.md$/.test(p)) expect(after[p], p).toBe(t);
  });

  it('--dry-run prints the plan and writes nothing', async () => {
    const repo = legacyRepo();
    const before = snapshotTree(repo.root);
    const r = await migrate(repo, [], { dryRun: true });
    expect(r.stdout).toContain('LEGACY_LAYOUT');
    expect(snapshotTree(repo.root)).toEqual(before);
  });

  it('refuses when a target already exists', async () => {
    const repo = legacyRepo();
    repo.write('rodo/shop/MAP.md', 'already here\n');
    await expect(migrate(repo, ['yes'])).rejects.toThrow(/already exists/);
    expect(repo.exists('rodo/MAP.md')).toBe(true);
  });

  it('replaces the pristine kit 2.0 AGENTS.md by the RODO block', async () => {
    const repo = legacyRepo();
    await migrate(repo, ['yes']);
    const t = repo.read('AGENTS.md');
    expect(t).toContain('<!-- rodo:start -->');
    expect(t).not.toContain('rodo/.kit-version');
    expect(repo.read('CLAUDE.md').trim()).toBe('@AGENTS.md');
  });

  it('works in a folder without git (plain move)', async () => {
    const repo = legacyRepo();
    repo.git('rm', '-r', '-q', '--cached', '.');
    const { rmSync } = await import('node:fs');
    rmSync(`${repo.root}/.git`, { recursive: true, force: true });
    await migrate(repo, ['yes']);
    expect(repo.exists('rodo/shop/cycles/001-x/card.rodo.md')).toBe(true);
  });
});
