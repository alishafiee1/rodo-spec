import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const cli = join(dirname(fileURLToPath(import.meta.url)), '../dist/index.js');

describe('CLI subprocess (built dist)', () => {
  afterEach(() => {
    delete process.env.RODO_HOME;
    delete process.env.RODO_TOKEN;
  });

  it.skip('rodo login --connect subprocess (Vitest worker blocks child fetch; see S01 in-process)', () => {});

  it('runs rodo init --method-only as a subprocess', () => {
    if (!existsSync(cli)) throw new Error('run pnpm build before connection-audit-cli tests');
    const home = mkdtempSync(join(tmpdir(), 'rodo-cli-init-'));
    const root = mkdtempSync(join(tmpdir(), 'rodo-cli-repo-'));
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
      execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], {
        cwd: root,
        env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
      });
      const out = execFileSync(
        process.execPath,
        [cli, 'init', '--method-only', '--project', 'shop', '--yes-files'],
        { cwd: root, env: { ...process.env, RODO_HOME: home, NO_COLOR: '1' }, encoding: 'utf8' },
      );
      expect(out).toContain('rodo/shop/');
      expect(existsSync(join(root, 'rodo/shop/project.json'))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});
