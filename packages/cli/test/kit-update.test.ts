import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init';
import { sha256 } from '../src/core/fs-atomic';
import { exec, KIT, KIT20, tempRepo } from './helpers/temp-repo';

const CODER = '.agents/skills/rodo/coder.md';
let tmpKit: string | null = null;
afterEach(() => {
  delete process.env.RODO_KIT_DIR;
  if (tmpKit) rmSync(tmpKit, { recursive: true, force: true });
  tmpKit = null;
});

/** a copy of the bundled kit where coder.md says something new */
function newerKit(): void {
  tmpKit = mkdtempSync(join(tmpdir(), 'rodo-kit-'));
  cpSync(KIT, tmpKit, { recursive: true });
  writeFileSync(join(tmpKit, CODER), 'NEW CODER TEXT\n');
  const m = JSON.parse(readFileSync(join(tmpKit, 'kit-manifest.json'), 'utf8'));
  m.version = '2.3.1-dev';
  writeFileSync(join(tmpKit, 'kit-manifest.json'), JSON.stringify(m));
  process.env.RODO_KIT_DIR = tmpKit;
}

const init = (repo: ReturnType<typeof tempRepo>) => exec(repo, (ctx) => runInit(ctx, { project: 'shop', methodOnly: true, yesFiles: true }));

describe('kit install and update (R1)', () => {
  it('a user-changed kit file is kept, the new text goes to .rodo-new, KIT_FILE_KEPT is printed', async () => {
    const repo = tempRepo();
    await init(repo);
    repo.write(CODER, 'MY EDITED CODER\n');
    newerKit();
    const r = await init(repo);
    expect(repo.read(CODER)).toBe('MY EDITED CODER\n');
    expect(repo.read(`${CODER}.rodo-new`)).toBe('NEW CODER TEXT\n');
    expect(r.stdout).toContain(`KIT_FILE_KEPT: ${CODER}`);
    expect(r.stdout).toContain('2.3.0 → 2.3.1-dev');
  });

  it('an unchanged kit file is overwritten with the new version', async () => {
    const repo = tempRepo();
    await init(repo);
    newerKit();
    const r = await init(repo);
    expect(repo.read(CODER)).toBe('NEW CODER TEXT\n');
    expect(repo.exists(`${CODER}.rodo-new`)).toBe(false);
    expect(r.stdout).not.toContain('KIT_FILE_KEPT');
    expect(JSON.parse(repo.read('rodo/kit.json')).files[CODER]).toBe(sha256('NEW CODER TEXT\n'));
  });

  it('the kept file keeps being kept on later runs (its recorded hash is not replaced)', async () => {
    const repo = tempRepo();
    await init(repo);
    repo.write(CODER, 'MY EDITED CODER\n');
    newerKit();
    await init(repo);
    const r = await init(repo);
    expect(repo.read(CODER)).toBe('MY EDITED CODER\n');
    expect(r.stdout).toContain('KIT_FILE_KEPT');
  });

  it('a pristine kit 2.0 file (no kit.json yet) is updated, not kept', async () => {
    const repo = tempRepo();
    repo.write(CODER, readFileSync(join(KIT20, CODER), 'utf8'));
    newerKit();
    const r = await init(repo);
    expect(repo.read(CODER)).toBe('NEW CODER TEXT\n');
    expect(r.stdout).not.toContain('KIT_FILE_KEPT');
  });

  it('a changed kit 2.0 file with no kit.json is kept', async () => {
    const repo = tempRepo();
    repo.write(CODER, 'edited in the 2.0 days\n');
    newerKit();
    const r = await init(repo);
    expect(repo.read(CODER)).toBe('edited in the 2.0 days\n');
    expect(r.stdout).toContain('KIT_FILE_KEPT');
  });

  it('--no-kit-update skips the kit step', async () => {
    const repo = tempRepo();
    await exec(repo, (ctx) => runInit(ctx, { project: 'shop', methodOnly: true, yesFiles: true, noKitUpdate: true }));
    expect(repo.exists('rodo/kit.json')).toBe(false);
    expect(repo.exists('rodo/shop/project.json')).toBe(true);
  });
});
