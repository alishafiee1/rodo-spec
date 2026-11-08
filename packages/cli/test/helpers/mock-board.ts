import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { CardState, ConnectResponse, MetaResponse, PushOp } from '@rodo/protocol';
import { saveToken } from '../../src/auth/token-store';
import { credentialsPath } from '../../src/auth/credentials-file';

export const MOCK_ORIGIN = 'https://rodo.mock.test';
export const MOCK_API = 'https://api.rodo.mock.test';

export const metaFor = (boardId: string, title = 'Board'): MetaResponse => ({
  board: { id: boardId, title, syncSeq: '30', archived: false, repoFingerprint: null, repoBrowseUrl: null },
  lists: [
    { id: 'l1', title: 'Start', workflowRole: 'START', position: 'a' },
    { id: 'l2', title: 'Active', workflowRole: 'ACTIVE', position: 'b' },
    { id: 'l3', title: 'Done', workflowRole: 'END', position: 'c' },
  ],
  labels: [],
  members: [],
  capabilities: {
    formatVersions: [2],
    cardStatuses: ['todo', 'in_progress', 'blocked', 'cancelled', 'done'],
    blockerTypes: ['decision', 'requirement', 'technical', 'test', 'environment', 'external', 'permission'],
    decisions: true,
    simpleDoc: true,
    approval: true,
  },
  limits: { pushOps: 100, pushBytes: 1_000_000, changesPage: 200, simpleDocBytes: 100_000, descriptionChars: 8000 },
  serverTimeMs: Date.now(),
  minCliVersion: '0.0.0',
});

export const sampleCard = (over: Partial<CardState> = {}): CardState => ({
  id: 'cid00000000000000000card1',
  rev: '5',
  updatedAt: 1,
  archived: false,
  deleted: false,
  rodoPath: 'cycles/004-a/card.rodo.md',
  title: 'Order cancel',
  description: 'x',
  status: 'done',
  list: 'Done',
  statusReason: null,
  blockerType: null,
  priority: 'medium',
  coverColor: null,
  startAt: null,
  dueAt: null,
  hours: null,
  financial: { type: 'none', amount: 0, category: 'general', date: null },
  scope: { allowed: [], forbidden: [] },
  test: { adapter: null, command: null },
  members: [],
  labels: [],
  locked: false,
  refs: [],
  decisions: [],
  checklists: [],
  simpleDoc: null,
  fieldRevs: {},
  ...over,
});

export interface ConnectCodeSpec {
  boardId: string;
  once?: boolean;
  expired?: boolean;
}

export interface MockBoardOptions {
  boards?: string[];
  connectCodes?: Record<string, ConnectCodeSpec>;
  readOnlyDevice?: boolean;
  archivedBoard?: boolean;
  /** First N push attempts per batch return 503 (fault injection). */
  pushFailCount?: number;
  trackOpIds?: boolean;
  onConnect?: (code: string) => void;
}

export interface MockBoardHarness {
  home: string;
  appliedOpIds: string[];
  pushAttempts: number;
  /** Underlying mock fetch (wrap it; do not call global fetch recursively). */
  fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response>;
  uninstall: () => void;
  seedLogin: (token?: string) => void;
}

/** Deterministic mock RODO board API via global fetch; isolated RODO_HOME. */
export function installMockBoard(opts: MockBoardOptions = {}): MockBoardHarness {
  const home = mkdtempSync(join(tmpdir(), 'rodo-mock-home-'));
  process.env.RODO_HOME = home;
  delete process.env.RODO_TOKEN;

  const boards = new Set(opts.boards ?? ['b1', 'b2', 'b3']);
  const cards = new Map<string, CardState>();
  const seenConnect = new Set<string>();
  const appliedOpIds = new Set<string>();
  let pushAttempts = 0;
  let pushFailsLeft = opts.pushFailCount ?? 0;
  let deviceToken = 'rodo_dev_mock_token_not_real';
  let revoked = false;
  let oldTokenAfterRotate: string | null = null;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const uninstall = () => {
    vi.unstubAllGlobals();
    process.env.RODO_HOME = process.env.RODO_TEST_HOME;
    delete process.env.RODO_TOKEN;
  };

  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
    const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    if (path === '/.well-known/rodo.json') {
      return json({ apiBaseUrl: MOCK_API });
    }

    if (path === '/v1/devices/connect' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { code?: string };
      const code = String(body.code ?? '');
      opts.onConnect?.(code);
      const spec = opts.connectCodes?.[code];
      if (!spec) return json({ code: 'CONNECT_CODE_INVALID', message: 'invalid code' }, 400);
      if (spec.expired) return json({ code: 'EXPIRED_TOKEN', message: 'expired' }, 400);
      if (spec.once && seenConnect.has(code)) return json({ code: 'CONNECT_CODE_INVALID', message: 'already used' }, 400);
      seenConnect.add(code);
      revoked = false;
      oldTokenAfterRotate = null;
      const r: ConnectResponse = {
        token: `rodo_dev_connect_${code.slice(-4)}`,
        deviceId: `dev_${code}`,
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { username: 'mock-user', name: 'Mock' },
        scopes: opts.readOnlyDevice ? ['boards:read'] : ['boards:read', 'boards:write', 'boards:create'],
        board: { id: spec.boardId, title: `Board ${spec.boardId}`, workspaceId: 'ws1', projectId: 'pr1' },
      };
      return json(r);
    }

    if (token && (revoked || token === oldTokenAfterRotate)) {
      return json({ code: 'DEVICE_REVOKED', message: 'revoked' }, 401);
    }

    if (path === '/v1/devices/me' && method === 'GET') {
      if (!token) return json({ code: 'DEVICE_TOKEN_INVALID', message: 'no token' }, 401);
      return json({
        deviceId: 'dev_mock',
        name: 'mock-cli',
        scopes: opts.readOnlyDevice ? ['boards:read'] : ['boards:read', 'boards:write'],
        boardIds: [...boards],
        expiresAt: '2099-01-01',
      });
    }

    if (path === '/v1/devices/me/revoke' && method === 'POST') {
      revoked = true;
      return json({ ok: true });
    }

    if (path === '/v1/devices/me/rotate' && method === 'POST') {
      oldTokenAfterRotate = deviceToken;
      deviceToken = 'rodo_dev_rotated_token';
      return json({ token: deviceToken, expiresAt: '2099-02-01T00:00:00.000Z' });
    }

    if (path === '/v1/sync/time') return json({ serverTimeMs: Date.now() });

    const boardMatch = /^\/v1\/sync\/boards\/([^/]+)\/(meta|changes|manifest|push|bind)$/.exec(path);
    if (boardMatch) {
      const boardId = boardMatch[1]!;
      const action = boardMatch[2]!;
      if (!boards.has(boardId)) return json({ code: 'BOARD_NOT_ALLOWED', message: 'no board' }, 403);

      if (action === 'meta') {
        const m = metaFor(boardId);
        if (opts.archivedBoard) m.board.archived = true;
        return json(m);
      }
      if (action === 'changes') {
        return json({ cards: [...cards.values()], toSeq: '30', hasMore: false, tombstones: [] });
      }
      if (action === 'manifest') {
        return json({ stale: [], unknown: [], archived: [], deleted: [], syncSeq: '30' });
      }
      if (action === 'bind' && method === 'POST') {
        return json({ meta: metaFor(boardId), warnings: [] });
      }
      if (action === 'push' && method === 'POST') {
        pushAttempts++;
        if (pushFailsLeft > 0) {
          pushFailsLeft--;
          return json({ code: 'DOWN', message: 'try again' }, 503);
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as { ops?: PushOp[] };
        const ops = body.ops ?? [];
        if (opts.readOnlyDevice) {
          return json({
            serverTimeMs: Date.now(),
            syncSeq: '31',
            results: ops.map((o) => ({ opId: o.opId, status: 'REJECTED', errors: [{ code: 'FORBIDDEN', message: 'read only' }] })),
          });
        }
        const results = ops.map((o) => {
          if (opts.trackOpIds !== false) {
            if (appliedOpIds.has(o.opId)) {
              return { opId: o.opId, status: 'NOOP', errors: [] };
            }
            appliedOpIds.add(o.opId);
          }
          const card = o.cardId ? (cards.get(o.cardId) ?? sampleCard({ id: o.cardId, rev: String(Number(o.baseRev) + 1) })) : sampleCard();
          cards.set(card.id, card);
          return { opId: o.opId, status: 'APPLIED', card, errors: [], conflicts: [] };
        });
        return json({ serverTimeMs: Date.now(), syncSeq: '31', results });
      }
    }

    if (path === '/v1/sync/validation' && method === 'POST') return json({ ok: true });

    return json({ code: 'NOT_FOUND', message: path }, 404);
  };

  vi.stubGlobal('fetch', fetchImpl);

  const seedLogin = (token = 'rodo_dev_mock_seed') => {
    saveToken(MOCK_ORIGIN, { token, deviceId: 'dev_seed', expiresAt: '2099-01-01' });
    deviceToken = token;
    revoked = false;
  };

  return {
    home,
    get appliedOpIds() {
      return [...appliedOpIds];
    },
    get pushAttempts() {
      return pushAttempts;
    },
    fetchImpl,
    uninstall,
    seedLogin,
  };
}

export function credKeys(): string[] {
  if (!existsSync(credentialsPath())) return [];
  const j = JSON.parse(readFileSync(credentialsPath(), 'utf8')) as Record<string, unknown>;
  return Object.keys(j);
}

export function credModeSafe(): number | null {
  try {
    return statSync(credentialsPath()).mode & 0o777;
  } catch {
    return null;
  }
}
