/**
 * Source-tree @2.3.0: characterize actual behavior vs desired safety from npm 2.6.0 / audit plan.
 * Desired-safety cases are expected to FAIL until source matches the published tarball.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProject, writeProject } from '../src/core/project';
import { runInit } from '../src/commands/init';
import { runSync } from '../src/commands/sync';
import { CLI_VERSION } from '../src/commands/version';
import { exec, initProject, tempRepo } from './helpers/temp-repo';
import { installMockBoard, MOCK_ORIGIN } from './helpers/mock-board';

let mock: ReturnType<typeof installMockBoard>;

beforeEach(() => {
  mock = installMockBoard({
    connectCodes: {
      'RODO-TEST-AAAA': { boardId: 'b1', once: true },
      'RODO-TEST-BBBB': { boardId: 'b2', once: true },
    },
  });
});

afterEach(() => mock.uninstall());

async function connectInit(repo: ReturnType<typeof tempRepo>, slug: string) {
  await initProject(repo, slug);
  return exec(repo, (ctx) => runInit(ctx, { project: slug, server: MOCK_ORIGIN, connect: 'RODO-TEST-AAAA', yesFiles: true }));
}

describe(`source characterization @${CLI_VERSION}`, () => {
  it('S05: re-init to another board overwrites boardId without error (unsafe vs npm 2.6.0)', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop');
    const r = await exec(repo, (ctx) => runInit(ctx, { project: 'shop', server: MOCK_ORIGIN, board: 'b2', yesFiles: true }));
    expect(r.code).toBe(0);
    expect(JSON.parse(repo.read('rodo/shop/project.json')).boardId).toBe('b2');
  });

  it('S07: two project folders may bind the same boardId (unsafe vs npm 2.6.0)', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop');
    await exec(repo, (ctx) => runInit(ctx, { project: 'back', methodOnly: true, yesFiles: true }));
    const r = await exec(repo, (ctx) => runInit(ctx, { project: 'back', server: MOCK_ORIGIN, board: 'b1', yesFiles: true }));
    expect(r.code).toBe(0);
  });

  it('S06: commander has no --rebind option (source index.ts)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/index.ts'), 'utf8');
    expect(src).not.toMatch(/option\(['"]--rebind/);
  });

  it('S11: manual boardId swap does not emit BOARD_CHANGED', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop');
    const dir = join(repo.root, 'rodo/shop');
    const cur = readProject(dir, 'shop').project!;
    writeProject(dir, { ...cur, boardId: 'b2' });
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, { check: true }));
    expect(r.stdout).not.toContain('BOARD_CHANGED');
  });
});

describe(`source desired safety (KNOWN_BUG until source === npm 2.6.0) @${CLI_VERSION}`, () => {
  it.fails('S05: should reject board change without --rebind (ALREADY_BOUND, exit 2)', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop');
    await expect(
      exec(repo, (ctx) => runInit(ctx, { project: 'shop', server: MOCK_ORIGIN, board: 'b2', yesFiles: true })),
    ).rejects.toMatchObject({ exitCode: 2, message: expect.stringContaining('ALREADY_BOUND') });
  });

  it.fails('S07: should reject second folder binding same board (BOARD_ALREADY_USED)', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop');
    await exec(repo, (ctx) => runInit(ctx, { project: 'back', methodOnly: true, yesFiles: true }));
    await expect(
      exec(repo, (ctx) => runInit(ctx, { project: 'back', server: MOCK_ORIGIN, board: 'b1', yesFiles: true })),
    ).rejects.toMatchObject({ exitCode: 2, message: expect.stringContaining('BOARD_ALREADY_USED') });
  });

  it.fails('S11: sync should note BOARD_CHANGED after manual project.json edit', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop');
    const dir = join(repo.root, 'rodo/shop');
    const cur = readProject(dir, 'shop').project!;
    writeProject(dir, { ...cur, boardId: 'b2' });
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, { check: true }));
    expect(r.stdout).toContain('BOARD_CHANGED');
  });
});
