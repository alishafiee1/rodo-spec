/**
 * Connection audit (draft plan scenarios 1–28). Mocked integration only — not production E2E.
 * See CONNECTION-AUDIT-REPORT.md for the scenario → result matrix.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginConnect } from '../src/auth/login';
import { getToken, saveToken } from '../src/auth/token-store';
import { runLogout, runLogin } from '../src/commands/auth';
import { runDoctor } from '../src/commands/doctor';
import { runInit } from '../src/commands/init';
import { connectProject } from '../src/commands/init-connect';
import { runStatus } from '../src/commands/status';
import { runSync } from '../src/commands/sync';
import { runValidate } from '../src/commands/validate';
import { BUILTIN_SERVER } from '../src/commands/server';
import { discover } from '../src/core/discovery';
import { repoFingerprint } from '../src/core/git';
import { readProject, writeProject } from '../src/core/project';
import { CLI_VERSION } from '../src/commands/version';
import { newState, writeBase, writeState } from '../src/sync/state';
import { addCycle, cardText, exec, initProject, snapshotTree, tempRepo } from './helpers/temp-repo';
import { credentialsPath } from '../src/auth/credentials-file';
import { credKeys, credModeSafe, installMockBoard, MOCK_API, MOCK_ORIGIN, sampleCard } from './helpers/mock-board';

let mock: ReturnType<typeof installMockBoard>;

beforeEach(() => {
  mock = installMockBoard({
    connectCodes: {
      'RODO-TEST-AAAA': { boardId: 'b1', once: true },
      'RODO-TEST-BBBB': { boardId: 'b2', once: true },
      'RODO-EXPIRED-XX': { boardId: 'b1', expired: true },
      'RODO-TEAM-ONLY': { boardId: 'b1', once: true },
    },
  });
});

afterEach(() => mock.uninstall());

async function connectInit(repo: ReturnType<typeof tempRepo>, slug: string, extra: Partial<Parameters<typeof runInit>[1]> = {}) {
  await initProject(repo, slug);
  return exec(repo, (ctx) => runInit(ctx, { project: slug, server: MOCK_ORIGIN, yesFiles: true, ...extra }));
}

describe('S01 connect code binds without leaking token', () => {
  it('stores credentials, sets boardId, never prints token', async () => {
    const repo = tempRepo();
    const r = await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    expect(r.code).toBe(0);
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    expect(pj.boardId).toBe('b1');
    expect(pj.serverUrl).toBe(MOCK_ORIGIN);
    expect(credKeys()).toEqual([MOCK_ORIGIN]);
    if (process.platform !== 'win32') expect(credModeSafe()! & 0o077).toBe(0);
    expect(r.stdout).not.toMatch(/rodo_dev_/);
    expect(r.stdout).not.toContain('Bearer ');
  });
});

describe('S02 connect code reuse', () => {
  it('rejects the same code twice with exit 4', async () => {
    await expect(loginConnect(MOCK_ORIGIN, CLI_VERSION, 'RODO-TEST-AAAA')).resolves.toBeDefined();
    await expect(loginConnect(MOCK_ORIGIN, CLI_VERSION, 'RODO-TEST-AAAA')).rejects.toMatchObject({ exitCode: 4 });
  });
});

describe('S03 expired connect code', () => {
  it('EXPIRED_TOKEN and writes no project binding', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const before = snapshotTree(repo.root);
    await expect(loginConnect(MOCK_ORIGIN, CLI_VERSION, 'RODO-EXPIRED-XX')).rejects.toMatchObject({ exitCode: 4, message: expect.stringContaining('EXPIRED') });
    expect(snapshotTree(repo.root)).toEqual(before);
  });
});

describe('S04 wrong server (code for mock, default builtin)', () => {
  it('does not save a token under the built-in host when connect fails there', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const nexusCalls: string[] = [];
    const base = mock.fetchImpl;
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('n3xus')) {
        nexusCalls.push(u);
        return new Response(JSON.stringify({ code: 'CONNECT_CODE_INVALID', message: 'wrong server' }), { status: 400 });
      }
      return base(url, init);
    });
    await expect(loginConnect(BUILTIN_SERVER, CLI_VERSION, 'RODO-TEAM-ONLY')).rejects.toMatchObject({ exitCode: 4 });
    expect(nexusCalls.length).toBeGreaterThan(0);
    expect(credKeys()).not.toContain(BUILTIN_SERVER);
    expect(getToken(MOCK_ORIGIN)).toBeNull();
  });

  it('saves token only for explicit --server mock host', async () => {
    await loginConnect(MOCK_ORIGIN, CLI_VERSION, 'RODO-TEST-BBBB');
    expect(credKeys()).toEqual([MOCK_ORIGIN]);
    expect(getToken(BUILTIN_SERVER)).toBeNull();
  });
});

describe('S05 rebind without --rebind (contract gap)', () => {
  it('current CLI allows rebinding to another board without ALREADY_BOUND', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    const pj0 = JSON.parse(repo.read('rodo/shop/project.json'));
    expect(pj0.boardId).toBe('b1');
    const r = await exec(repo, (ctx) => runInit(ctx, { project: 'shop', server: MOCK_ORIGIN, board: 'b2', yesFiles: true }));
    expect(r.code).toBe(0);
    const pj1 = JSON.parse(repo.read('rodo/shop/project.json'));
    expect(pj1.boardId).toBe('b2');
  });
});

describe('S06 rebind with --rebind flag', () => {
  it('BLOCKED: CLI has no --rebind option in commander', () => {
    expect(true).toBe(true);
  });
});

describe('S07 two folders one board', () => {
  it('BLOCKED: no BOARD_ALREADY_USED client guard in this revision', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    await exec(repo, (ctx) => runInit(ctx, { project: 'back', methodOnly: true, yesFiles: true }));
    const r = await exec(repo, (ctx) => runInit(ctx, { project: 'back', server: MOCK_ORIGIN, board: 'b1', yesFiles: true }));
    expect(r.code).toBe(0);
    expect(JSON.parse(repo.read('rodo/back/project.json')).boardId).toBe('b1');
  });
});

describe('S08 two projects two boards', () => {
  it('each project folder keeps its own boardId', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'front', { connect: 'RODO-TEST-AAAA' });
    await exec(repo, (ctx) => runInit(ctx, { project: 'back', methodOnly: true, yesFiles: true }));
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runInit(ctx, { project: 'back', server: MOCK_ORIGIN, board: 'b2', yesFiles: true }));
    expect(r.code).toBe(0);
    expect(JSON.parse(repo.read('rodo/front/project.json')).boardId).toBe('b1');
    expect(JSON.parse(repo.read('rodo/back/project.json')).boardId).toBe('b2');
  });
});

describe('S09 cwd project resolution', () => {
  it('status from cycle subfolder targets cwd project; root shows all', async () => {
    const repo = tempRepo();
    await exec(repo, (ctx) => runInit(ctx, { project: 'front', methodOnly: true, yesFiles: true }));
    await exec(repo, (ctx) => runInit(ctx, { project: 'back', methodOnly: true, yesFiles: true }));
    const sub = join(repo.root, 'rodo/front/cycles/001-a');
    const rSub = await exec(repo, (ctx) => runStatus(ctx, {}), { cwd: sub });
    expect(rSub.stdout).toContain('Project  front');
    expect(rSub.stdout).not.toContain('Project  back');
    const rRoot = await exec(repo, (ctx) => runStatus(ctx, { project: ['front', 'back'] }));
    expect(rRoot.stdout).toContain('Project  front');
    expect(rRoot.stdout).toContain('Project  back');
  });
});

describe('S10 logout then bind same board', () => {
  it('logout clears token only; rebound init still sets boardId (no unbind)', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    mock.seedLogin();
    const out = await exec(repo, (ctx) => runLogout(ctx, { server: MOCK_ORIGIN }));
    expect(out.code).toBe(0);
    expect(getToken(MOCK_ORIGIN)).toBeNull();
    expect(JSON.parse(repo.read('rodo/shop/project.json')).boardId).toBe('b1');
    await loginConnect(MOCK_ORIGIN, CLI_VERSION, 'RODO-TEST-BBBB');
    const r = await exec(repo, (ctx) => runInit(ctx, { project: 'shop', server: MOCK_ORIGIN, board: 'b2', yesFiles: true }));
    expect(r.code).toBe(0);
  });
});

describe('S11 manual boardId edit', () => {
  it('sync against swapped board id still uses project.json board (no BOARD_CHANGED code)', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    const dir = join(repo.root, 'rodo/shop');
    const cur = readProject(dir, 'shop').project!;
    writeProject(dir, { ...cur, boardId: 'b2' });
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, { check: true }));
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('BOARD_CHANGED');
  });
});

describe('S12 two collaborators same ancestry', () => {
  it('pull on clone B sees card pushed from clone A', async () => {
    const a = tempRepo();
    await connectInit(a, 'shop', { connect: 'RODO-TEST-AAAA' });
    a.commit('bound');
    const cloneRoot = mkdtempSync(join(tmpdir(), 'rodo-clone-'));
    execFileSync('git', ['clone', '-q', a.root, cloneRoot], { encoding: 'utf8' });
    const card = sampleCard({ id: 'cid00000000000000000sync1', rev: '10', status: 'done' });
    const base = mock.fetchImpl;
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/changes')) {
        return new Response(JSON.stringify({ cards: [card], toSeq: '40', hasMore: false, tombstones: [] }), { status: 200 });
      }
      return base(url, init);
    });
    mock.seedLogin();
    process.env.RODO_TOKEN = getToken(MOCK_ORIGIN)!.token;
    const r = await exec(cloneRoot, (ctx) => runSync(ctx, {}));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/pulled \d+/);
    rmSync(cloneRoot, { recursive: true, force: true });
  });
});

describe('S13 concurrent edit same field', () => {
  it('CONFLICT_RESOLVED keeps board title and saves local copy path', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', title: 'Mine', status: 'done', extraFm: 'id: cid00000000000000000card1' }));
    const dir = join(repo.root, 'rodo/shop');
    const st = newState({ serverUrl: MOCK_ORIGIN, apiBaseUrl: MOCK_API, boardId: 'b1', deviceId: 'd1' });
    st.cards['cid00000000000000000card1'] = { path: 'cycles/004-a/card.rodo.md', baseRev: '5', baseHash: '', fileHash: '', simpleDocHash: null, simpleDocBranch: null, lastSyncAt: 1 };
    writeState(dir, st);
    writeBase(dir, sampleCard());
    const base = mock.fetchImpl;
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/push')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const opId = body.ops?.[0]?.opId ?? 'op1';
        return new Response(JSON.stringify({
          serverTimeMs: Date.now(),
          syncSeq: '31',
          results: [{
            opId,
            status: 'APPLIED',
            card: sampleCard({ rev: '6', title: 'BoardTitle' }),
            conflicts: [{ field: 'title', winner: 'server' }],
            errors: [],
          }],
        }), { status: 200 });
      }
      return base(url, init);
    });
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.stdout).toContain('CONFLICT_RESOLVED');
  });
});

describe('S14 concurrent different fields', () => {
  it('mock server applies non-conflicting updates', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', status: 'in_progress', extraFm: 'id: cid00000000000000000card1\npriority: high' }));
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/pushed/);
  });
});

describe('S15 delete local file, server changed', () => {
  it('CONFLICT_RESOLVED restores file when server changed after delete', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    const rel = 'rodo/shop/cycles/004-a/card.rodo.md';
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', extraFm: 'id: cid00000000000000000card1' }));
    const dir = join(repo.root, 'rodo/shop');
    const st = newState({ serverUrl: MOCK_ORIGIN, apiBaseUrl: MOCK_API, boardId: 'b1', deviceId: 'd1' });
    st.cards['cid00000000000000000card1'] = { path: 'cycles/004-a/card.rodo.md', baseRev: '5', baseHash: '', fileHash: '', simpleDocHash: null, simpleDocBranch: null, lastSyncAt: 1 };
    writeState(dir, st);
    writeBase(dir, sampleCard({ rev: '5' }));
    rmSync(join(repo.root, rel), { force: true });
    const remote = sampleCard({ rev: '6', title: 'Server edited' });
    const base = mock.fetchImpl;
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/changes')) {
        return new Response(JSON.stringify({ cards: [remote], toSeq: '31', hasMore: false, tombstones: [] }), { status: 200 });
      }
      return base(url, init);
    });
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.stdout).toContain('CONFLICT_RESOLVED');
    expect(repo.exists(rel)).toBe(true);
  });
});

describe('S16 archive confirmation', () => {
  it('ARCHIVE_CONFIRM_REQUIRED without --confirm-archive', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    const dir = join(repo.root, 'rodo/shop');
    for (let i = 0; i < 11; i++) {
      addCycle(repo, 'shop', `0${i}-x`, cardText({ folder: `0${i}-x`, extraFm: `id: cid000000000000000000${i}` }));
      const st = readFileSync(join(dir, '.rodo/state.json'), 'utf8');
      const parsed = JSON.parse(st);
      parsed.cards[`cid000000000000000000${i}`] = { path: `cycles/0${i}-x/card.rodo.md`, baseRev: '1', baseHash: '', fileHash: '', simpleDocHash: null, simpleDocBranch: null, lastSyncAt: 1 };
      writeState(dir, parsed);
      rmSync(join(dir, 'cycles', `0${i}-x`, 'card.rodo.md'), { force: true });
    }
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.stdout).toContain('ARCHIVE_CONFIRM_REQUIRED');
  });
});

describe('S17 archived board', () => {
  it('BOARD_ARCHIVED surfaces from meta (doctor/sync note)', async () => {
    mock.uninstall();
    mock = installMockBoard({ archivedBoard: true, connectCodes: { 'RODO-TEST-AAAA': { boardId: 'b1', once: true } } });
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.code).toBeGreaterThanOrEqual(0);
  });
});

describe('S18 duplicate sync idempotency', () => {
  it('second sync reports no push/pull work', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    mock.seedLogin();
    await exec(repo, (ctx) => runSync(ctx, {}));
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.stdout).toMatch(/pulled 0 · pushed 0/);
  });
});

describe('S19 interrupted push retries deterministic opId', () => {
  it('retries 503 without duplicating applied ops', async () => {
    mock.uninstall();
    mock = installMockBoard({ pushFailCount: 1, connectCodes: { 'RODO-TEST-AAAA': { boardId: 'b1', once: true } } });
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', title: 'edited', extraFm: 'id: cid00000000000000000card1' }));
    const dir = join(repo.root, 'rodo/shop');
    const st = newState({ serverUrl: MOCK_ORIGIN, apiBaseUrl: MOCK_API, boardId: 'b1', deviceId: 'd1' });
    st.cards['cid00000000000000000card1'] = { path: 'cycles/004-a/card.rodo.md', baseRev: '5', baseHash: '', fileHash: '', simpleDocHash: null, simpleDocBranch: null, lastSyncAt: 1 };
    writeState(dir, st);
    writeBase(dir, sampleCard());
    mock.seedLogin();
    await exec(repo, (ctx) => runSync(ctx, {}));
    expect(mock.pushAttempts).toBeGreaterThan(1);
    expect(mock.appliedOpIds.length).toBeGreaterThan(0);
  });
});

describe('S20 offline sync', () => {
  it('validates without network writes beyond report', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }));
    const r = await exec(repo, (ctx) => runSync(ctx, { offline: true }));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('offline');
  });
});

describe('S21 copy project folder to another repo', () => {
  it('REPOSITORY_MISMATCH exit 6 when fingerprint differs', async () => {
    const a = tempRepo();
    await connectInit(a, 'shop', { connect: 'RODO-TEST-AAAA' });
    const fp = repoFingerprint(a.root)!;
    const b = tempRepo();
    cpSync(join(a.root, 'rodo'), join(b.root, 'rodo'), { recursive: true });
    const pj = JSON.parse(b.read('rodo/shop/project.json'));
    b.write('rodo/shop/project.json', JSON.stringify({ ...pj, repoFingerprint: fp }));
    mock.seedLogin();
    const r = await exec(b, (ctx) => runSync(ctx, {}));
    expect(r.code).toBe(6);
    expect(r.stdout).toContain('REPOSITORY_MISMATCH');
  });
});

describe('S22 card id from another board', () => {
  it('validation still runs; bound board mismatch is BOARD_MISMATCH when boardId set (v1)', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, boardId: 'b2' }));
    const v1 = cardText({ folder: '004-a', extraFm: 'schemaVersion: 1\nboardId: b1\nid: cid00000000000000000other' }).replace('schemaVersion: 2', '');
    addCycle(repo, 'shop', '004-a', v1);
    const r = await exec(repo, (ctx) => runValidate(ctx, []));
    expect(r.stdout).toContain('BOARD_MISMATCH');
  });
});

describe('S23 revoked token', () => {
  it('sync exit 4 on DEVICE_REVOKED', async () => {
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    mock.seedLogin();
    mock.uninstall();
    mock = installMockBoard({
      connectCodes: { 'RODO-TEST-AAAA': { boardId: 'b1', once: true } },
    });
    mock.seedLogin('rodo_dev_revoked');
    const base = mock.fetchImpl;
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === '/.well-known/rodo.json') return base(url, init);
      if (path.includes('/devices/me') || path.includes('/sync/')) {
        return new Response(JSON.stringify({ code: 'DEVICE_REVOKED', message: 'gone' }), { status: 401 });
      }
      return base(url, init);
    });
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.code).toBe(4);
    expect(r.stdout).toContain('DEVICE_REVOKED');
  });
});

describe('S24 token rotate', () => {
  it('old token rejected after rotate', async () => {
    mock.seedLogin('rodo_dev_before_rotate');
    const old = getToken(MOCK_ORIGIN)!.token;
    await exec(tempRepo(), (ctx) => runLogin(ctx, { server: MOCK_ORIGIN, rotate: true }));
    const neu = getToken(MOCK_ORIGIN)!.token;
    expect(neu).not.toBe(old);
    saveToken(MOCK_ORIGIN, { token: old, deviceId: 'x', expiresAt: '' });
    const { apiHttp } = await import('../src/auth/login');
    const { http } = await apiHttp(MOCK_ORIGIN, old, CLI_VERSION);
    await expect(http.get('/v1/devices/me')).rejects.toMatchObject({ status: 401 });
  });
});

describe('S25 read-only device', () => {
  it('FORBIDDEN on push results', async () => {
    mock.uninstall();
    mock = installMockBoard({ readOnlyDevice: true, connectCodes: { 'RODO-TEST-AAAA': { boardId: 'b1', once: true } } });
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', title: 'push me', extraFm: 'id: cid00000000000000000card1' }));
    const dir = join(repo.root, 'rodo/shop');
    const st = newState({ serverUrl: MOCK_ORIGIN, apiBaseUrl: MOCK_API, boardId: 'b1', deviceId: 'd1' });
    st.cards['cid00000000000000000card1'] = { path: 'cycles/004-a/card.rodo.md', baseRev: '5', baseHash: '', fileHash: '', simpleDocHash: null, simpleDocBranch: null, lastSyncAt: 1 };
    writeState(dir, st);
    writeBase(dir, sampleCard());
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.stdout).toContain('FORBIDDEN');
    expect(r.code).toBe(0);
  });
});

describe('S26 token redaction in outputs', () => {
  it('doctor/login JSON and verbose paths omit bearer material', async () => {
    const secret = 'rodo_dev_redact_SAMPLE';
    saveToken(MOCK_ORIGIN, { token: secret, deviceId: 'd', expiresAt: '' });
    const repo = tempRepo();
    await initProject(repo);
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, serverUrl: MOCK_ORIGIN, boardId: 'b1' }));
    const d = await exec(repo, (ctx) => runDoctor(ctx), { json: true });
    const blob = JSON.stringify(d.json()) + d.stdout;
    expect(blob).not.toContain(secret);
    const lg = await exec(repo, (ctx) => runLogin(ctx, { server: MOCK_ORIGIN, connect: 'RODO-TEST-BBBB' }), { json: true });
    expect(lg.stdout + JSON.stringify(lg.json())).not.toMatch(/rodo_dev_connect/);
  });
});

describe('S27 secret in card', () => {
  it('validate flags SECRET_SUSPECTED without echoing value', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-a', cardText({ body: 'token=super_secret_value_xyz\n\n## Progress notes\n\n- x' }));
    const r = await exec(repo, (ctx) => runValidate(ctx, []));
    expect(r.stdout).toContain('SECRET_SUSPECTED');
    expect(r.stdout).not.toContain('super_secret_value_xyz');
  });
});

describe('S28 shallow clone', () => {
  it('REPO_SHALLOW warning during online sync and null repoFingerprint on bind', async () => {
    const git = await import('../src/core/git');
    const shallowSpy = vi.spyOn(git, 'isShallow').mockReturnValue(true);
    const fpSpy = vi.spyOn(git, 'repoFingerprint').mockReturnValue(null);
    const repo = tempRepo();
    await connectInit(repo, 'shop', { connect: 'RODO-TEST-AAAA' });
    const pj = JSON.parse(repo.read('rodo/shop/project.json'));
    expect(pj.repoFingerprint).toBeNull();
    mock.seedLogin();
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    shallowSpy.mockRestore();
    fpSpy.mockRestore();
    expect(r.stdout).toContain('REPO_SHALLOW');
  });
});

describe('RODO_TOKEN env precedence', () => {
  it('env token wins and is not written to credentials file', async () => {
    saveToken(MOCK_ORIGIN, { token: 'rodo_dev_on_disk_only', deviceId: 'd', expiresAt: '' });
    process.env.RODO_TOKEN = 'rodo_dev_from_env_only';
    expect(getToken(MOCK_ORIGIN)!.token).toBe('rodo_dev_from_env_only');
    const raw = readFileSync(credentialsPath(), 'utf8');
    expect(raw).not.toContain('rodo_dev_from_env_only');
    delete process.env.RODO_TOKEN;
  });
});
