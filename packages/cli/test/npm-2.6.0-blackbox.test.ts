/**
 * Black-box tests: published npm `rodo-spec@2.6.0` tarball (integrity-pinned).
 * Does not use Vitest global fetch stubs; talks to a real local HTTP mock.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startLocalMock, type LocalMock } from './helpers/local-mock-server';
import { freshHome, NPM_RODO_SPEC_260_INTEGRITY, NPM_RODO_SPEC_260_SHASUM, rodoNpm260Bin } from './helpers/npm-cli-260';

let rodoBin: string;

beforeAll(() => {
  rodoBin = rodoNpm260Bin();
});

function gitRepo(): { root: string; home: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'rodo-bb-repo-'));
  const home = freshHome();
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  writeFileSync(join(root, 'README.md'), `# t ${Math.random()}\n`);
  spawnSync(
    'git',
    ['add', 'README.md', '&&', 'git', 'commit', '-q', '-m', 'init'],
    { cwd: root, shell: true, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } },
  );
  spawnSync('git', ['add', 'README.md'], { cwd: root });
  spawnSync('git', ['commit', '-q', '-m', 'init'], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  return {
    root,
    home,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    },
  };
}

async function runRodo(
  bin: string,
  args: string[],
  o: { cwd: string; home: string },
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: o.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        RODO_HOME: o.home,
        NO_COLOR: '1',
        npm_config_ignore_scripts: 'true',
        NODE_OPTIONS: '',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`rodo subprocess timeout (${args.join(' ')})`));
    }, 60_000);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out: `${stdout}${stderr}`, err: stderr });
    });
    child.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

describe('npm rodo-spec@2.6.0 pin evidence', () => {
  it('documents registry integrity and shasum', () => {
    expect(NPM_RODO_SPEC_260_INTEGRITY).toMatch(/^sha512-/);
    expect(NPM_RODO_SPEC_260_SHASUM).toHaveLength(40);
    expect(rodoBin).toContain('dist/index.js');
  });
});

describe('npm 2.6.0 black-box (local mock)', () => {
  let mock: LocalMock;

  afterEach(async () => {
    await mock?.close();
  });

  async function boot() {
    mock = await startLocalMock({
      connectCodes: {
        'RODO-BB-AAAA': { boardId: 'b1', once: true },
        'RODO-BB-BBBB': { boardId: 'b2', once: true },
      },
    });
    return mock;
  }

  it('subprocess login --connect does not print token material', async () => {
    const m = await boot();
    const { home, cleanup } = (() => {
      const h = freshHome();
      return { home: h, cleanup: () => rmSync(h, { recursive: true, force: true }) };
    })();
    const r = await runRodo(rodoBin, ['login', '--server', m.origin, '--connect', 'RODO-BB-AAAA'], { cwd: tmpdir(), home });
    cleanup();
    expect(r.code).toBe(0);
    expect(r.out).toContain('Logged in');
    expect(r.out).not.toMatch(/rodo_dev_local_/);
  });

  it('S05 safety: ALREADY_BOUND without --rebind', async () => {
    const m = await boot();
    const repo = gitRepo();
    let r = await runRodo(
      rodoBin,
      ['init', '--project', 'shop', '--server', m.origin, '--connect', 'RODO-BB-AAAA', '--yes-files'],
      { cwd: repo.root, home: repo.home },
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(join(repo.root, 'rodo/shop/project.json'), 'utf8')).boardId).toBe('b1');
    r = await runRodo(rodoBin, ['init', '--project', 'shop', '--server', m.origin, '--board', 'b2', '--yes-files'], {
      cwd: repo.root,
      home: repo.home,
    });
    expect(r.code).toBe(2);
    expect(r.out).toContain('ALREADY_BOUND');
    expect(JSON.parse(readFileSync(join(repo.root, 'rodo/shop/project.json'), 'utf8')).boardId).toBe('b1');
    repo.cleanup();
  });

  it('S06 safety: --rebind clears base and moves board', async () => {
    const m = await boot();
    const repo = gitRepo();
    await runRodo(rodoBin, ['init', '--project', 'shop', '--server', m.origin, '--connect', 'RODO-BB-AAAA', '--yes-files'], {
      cwd: repo.root,
      home: repo.home,
    });
    const baseDir = join(repo.root, 'rodo/shop/.rodo/base');
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(join(baseDir, 'marker.txt'), 'keep-check', { flag: 'w' });
    const r = await runRodo(
      rodoBin,
      ['init', '--project', 'shop', '--server', m.origin, '--board', 'b2', '--rebind', '--yes-files'],
      { cwd: repo.root, home: repo.home },
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(join(repo.root, 'rodo/shop/project.json'), 'utf8')).boardId).toBe('b2');
    expect(existsSync(join(baseDir, 'marker.txt'))).toBe(false);
    repo.cleanup();
  });

  it('S07 safety: BOARD_ALREADY_USED for second folder', async () => {
    const m = await boot();
    const repo = gitRepo();
    await runRodo(rodoBin, ['init', '--project', 'shop', '--server', m.origin, '--connect', 'RODO-BB-AAAA', '--yes-files'], {
      cwd: repo.root,
      home: repo.home,
    });
    await runRodo(rodoBin, ['init', '--project', 'back', '--method-only', '--yes-files'], { cwd: repo.root, home: repo.home });
    const r = await runRodo(rodoBin, ['init', '--project', 'back', '--server', m.origin, '--board', 'b1', '--yes-files'], {
      cwd: repo.root,
      home: repo.home,
    });
    expect(r.code).toBe(2);
    expect(r.out).toContain('BOARD_ALREADY_USED');
    repo.cleanup();
  });

  it('S11 safety: BOARD_CHANGED when project.json board differs from state', async () => {
    const m = await boot();
    const repo = gitRepo();
    await runRodo(rodoBin, ['init', '--project', 'shop', '--server', m.origin, '--connect', 'RODO-BB-AAAA', '--yes-files'], {
      cwd: repo.root,
      home: repo.home,
    });
    const pjPath = join(repo.root, 'rodo/shop/project.json');
    const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
    writeFileSync(pjPath, JSON.stringify({ ...pj, boardId: 'b2' }));
    const r = await runRodo(rodoBin, ['sync', '--check'], { cwd: repo.root, home: repo.home });
    expect(r.code).toBe(0);
    expect(r.out).toContain('BOARD_CHANGED');
    repo.cleanup();
  });
});
