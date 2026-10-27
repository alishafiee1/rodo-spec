import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CardState } from '@rodo/protocol';
import { runStatus } from '../src/commands/status';
import { runSync } from '../src/commands/sync';
import { localChecks } from '../src/commands/doctor';
import { discover } from '../src/core/discovery';
import { newState, writeBase, writeState } from '../src/sync/state';
import { addCycle, cardText, exec, initProject, tempRepo } from './helpers/temp-repo';

const SERVER = 'http://rodo.test';
const card = (over: Partial<CardState> = {}): CardState => ({
  id: 'cid00000000000000000card1', rev: '5', updatedAt: 1, archived: false, deleted: false, rodoPath: 'cycles/004-a/card.rodo.md',
  title: 'Order cancel', description: 'x', status: 'done', list: 'انجام‌شده', statusReason: null, blockerType: null,
  priority: 'medium', coverColor: null, startAt: null, dueAt: null, hours: null,
  financial: { type: 'none', amount: 0, category: 'general', date: null }, scope: { allowed: [], forbidden: [] }, test: { adapter: null, command: null },
  members: [], labels: [], locked: false, refs: [], decisions: [], checklists: [], simpleDoc: null, fieldRevs: {}, ...over,
});

const META = {
  board: { id: 'b1', title: 'B', syncSeq: '30', archived: false, repoFingerprint: null, repoBrowseUrl: null },
  lists: [{ id: 'l1', title: 'برنامه‌ریزی', workflowRole: 'START', position: 'a' }, { id: 'l2', title: 'در حال انجام', workflowRole: 'ACTIVE', position: 'b' }, { id: 'l3', title: 'انجام‌شده', workflowRole: 'END', position: 'c' }],
  labels: [], members: [],
  capabilities: { formatVersions: [2], cardStatuses: ['todo', 'in_progress', 'blocked', 'cancelled', 'done'], blockerTypes: ['decision', 'requirement', 'technical', 'test', 'environment', 'external', 'permission'], decisions: true, simpleDoc: true, approval: true },
  limits: { pushOps: 100, pushBytes: 1000000, changesPage: 200, simpleDocBytes: 100000, descriptionChars: 8000 },
  serverTimeMs: 0, minCliVersion: '0.0.0',
};

function stubServer(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const hit = Object.entries(routes).find(([k]) => path === k);
    const body = typeof hit?.[1] === 'function' ? (hit[1] as (u: string, i?: RequestInit) => unknown)(url, init) : hit?.[1];
    return hit ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{}', { status: 404 });
  });
}

async function boundRepo() {
  const repo = tempRepo();
  await initProject(repo);
  const pj = JSON.parse(repo.read('rodo/shop/project.json'));
  repo.write('rodo/shop/project.json', JSON.stringify({ ...pj, serverUrl: SERVER, boardId: 'b1' }));
  addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', status: 'done', extraFm: 'id: cid00000000000000000card1' }));
  const dir = join(repo.root, 'rodo', 'shop');
  const st = newState({ serverUrl: SERVER, apiBaseUrl: SERVER, boardId: 'b1', deviceId: 'd1' });
  st.lastSeq = '30';
  st.cards['cid00000000000000000card1'] = { path: 'cycles/004-a/card.rodo.md', baseRev: '5', baseHash: '', fileHash: '', simpleDocHash: null, simpleDocBranch: null, lastSyncAt: 1 };
  writeState(dir, st);
  writeBase(dir, card());
  return repo;
}

beforeEach(() => { process.env.RODO_TOKEN = 'rodo_dev_test'; process.env.RODO_HOME = mkdtempSync(join(tmpdir(), 'rodo-home-')); });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.RODO_TOKEN; process.env.RODO_HOME = process.env.RODO_TEST_HOME; });

describe('status against the board (dogfood #12)', () => {
  it('shows the board status of a card that did not change since the last sync', async () => {
    const repo = await boundRepo();
    stubServer({ '/v1/sync/boards/b1/changes': { cards: [], toSeq: '30', hasMore: false, tombstones: [] } });
    const r = await exec(repo, (ctx) => runStatus(ctx, {}), { json: true });
    const row = r.json().projects[0].cards[0];
    expect(row.board).toBe('done');
  });
});

describe('sync --check (dogfood #13)', () => {
  it('prints no DRIFT line when nothing drifted', async () => {
    const repo = await boundRepo();
    stubServer({
      '/v1/sync/time': { serverTimeMs: Date.now() },
      '/v1/sync/boards/b1/meta': META,
      '/v1/sync/boards/b1/manifest': { stale: [], unknown: [], archived: [], deleted: [], syncSeq: '30' },
    });
    const r = await exec(repo, (ctx) => runSync(ctx, { check: true }));
    expect(r.stdout).not.toContain('DRIFT');
  });
  it('still prints DRIFT when something drifted', async () => {
    const repo = await boundRepo();
    stubServer({
      '/v1/sync/time': { serverTimeMs: Date.now() },
      '/v1/sync/boards/b1/meta': META,
      '/v1/sync/boards/b1/manifest': { stale: ['x'], unknown: [], archived: [], deleted: [], syncSeq: '31' },
    });
    const r = await exec(repo, (ctx) => runSync(ctx, { check: true }));
    expect(r.stdout).toContain('DRIFT: stale 1');
  });
});

describe('doctor when logged in but not bound (dogfood #14)', () => {
  it('says "logged in", not "not connected"', async () => {
    const repo = tempRepo();
    await initProject(repo);
    const cs = localChecks(discover(repo.root)!);
    const c = cs.find((x) => x.id === 'credentials')!;
    expect(c.level).toBe('OK');
    expect(c.message).toContain('logged in');
  });
});

describe('status lists conflicts the board won (dogfood P1-2)', () => {
  it('prints the field, your old value and where your file is', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a' }));
    repo.write('rodo/shop/.rodo/last-sync.json', JSON.stringify({ version: 1, project: 'shop', startedAt: 1, finishedAt: 2, mode: 'online', clock: { offsetMs: 0, source: 'server' }, pulled: 0, pushed: 0, created: 0, archived: 0,
      conflicts: [{ path: 'cycles/004-a/card.rodo.md', field: 'title', winner: 'server', localValue: 'Mine', localCopy: '.rodo/conflicts/c.local-1.rodo.md' }], notes: [], files: [], summary: { files: 1, errors: 0, warnings: 0 } }));
    const r = await exec(repo, (ctx) => runStatus(ctx, { local: true }));
    expect(r.stdout).toContain('Conflict cycles/004-a/card.rodo.md: title kept the board value (yours: Mine); your file: rodo/shop/.rodo/conflicts/c.local-1.rodo.md');
  });
  it('sync CONFLICT_RESOLVED warning includes repo-relative rodo/<slug>/.rodo/conflicts/ path', async () => {
    const repo = await boundRepo();
    addCycle(repo, 'shop', '004-a', cardText({ folder: '004-a', title: 'Mine', status: 'done', extraFm: 'id: cid00000000000000000card1' }));
    stubServer({
      '/v1/sync/time': { serverTimeMs: Date.now() },
      '/v1/sync/boards/b1/meta': META,
      '/v1/sync/boards/b1/changes': { cards: [], toSeq: '30', hasMore: false, tombstones: [] },
      '/v1/sync/boards/b1/push': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const opId = body.ops?.[0]?.opId ?? 'op1';
        return {
          serverTimeMs: Date.now(),
          syncSeq: '31',
          results: [{
            opId,
            status: 'APPLIED',
            card: card({ rev: '6', title: 'BoardTitle' }),
            conflicts: [{ field: 'title', winner: 'server' }],
            errors: [],
          }],
        };
      },
    });
    const r = await exec(repo, (ctx) => runSync(ctx, {}));
    expect(r.stdout).toContain('your file is saved in rodo/shop/.rodo/conflicts/cid00000000000000000card1.local-');
  });
});
