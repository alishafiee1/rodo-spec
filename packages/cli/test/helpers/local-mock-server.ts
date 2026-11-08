import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ConnectCodeSpec } from './mock-board';

export interface LocalMockOpts {
  connectCodes?: Record<string, ConnectCodeSpec>;
  readOnlyDevice?: boolean;
}

export interface LocalMock {
  origin: string;
  port: number;
  close: () => Promise<void>;
}

/** Real TCP mock API for subprocess / black-box CLI tests (no global fetch stub). */
export function startLocalMock(opts: LocalMockOpts = {}): Promise<LocalMock> {
  const seenConnect = new Set<string>();
  let deviceToken = 'rodo_dev_local_mock';
  let revoked = false;

  let server: Server;
  let port = 0;

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0]!;
      const method = req.method ?? 'GET';
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      const auth = String(req.headers.authorization ?? '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

      if (path === '/.well-known/rodo.json') {
        return send(200, { apiBaseUrl: `http://127.0.0.1:${port}` });
      }

      if (path === '/v1/devices/connect' && method === 'POST') {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
          const code = String(JSON.parse(raw || '{}').code ?? '');
          const spec = opts.connectCodes?.[code];
          if (!spec) return send(400, { code: 'CONNECT_CODE_INVALID', message: 'invalid' });
          if (spec.expired) return send(400, { code: 'EXPIRED_TOKEN', message: 'expired' });
          if (spec.once && seenConnect.has(code)) return send(400, { code: 'CONNECT_CODE_INVALID', message: 'used' });
          seenConnect.add(code);
          revoked = false;
          deviceToken = `rodo_dev_local_${code.slice(-4)}`;
          send(200, {
            token: deviceToken,
            deviceId: `dev_${code}`,
            expiresAt: '2099-01-01T00:00:00.000Z',
            user: { username: 'mock', name: 'Mock' },
            scopes: opts.readOnlyDevice ? ['sync:read'] : ['sync:read', 'sync:write', 'boards:create'],
            board: { id: spec.boardId, title: `B ${spec.boardId}`, workspaceId: 'w', projectId: 'p' },
          });
        });
        return;
      }

      if (token && revoked) return send(401, { code: 'DEVICE_REVOKED', message: 'revoked' });

      if (path === '/v1/devices/me' && method === 'GET') {
        if (!token) return send(401, { code: 'DEVICE_TOKEN_INVALID', message: 'no token' });
        return send(200, {
          deviceId: 'dev_mock',
          name: 'mock-cli',
          scopes: ['sync:read', 'sync:write', 'boards:create'],
          boardIds: ['b1', 'b2'],
          expiresAt: '2099-01-01',
        });
      }

      if (path === '/v1/sync/time') return send(200, { serverTimeMs: Date.now() });

      const boardRoute = /^\/v1\/sync\/boards\/([^/]+)\/(meta|changes|manifest|push|bind)$/.exec(path);
      if (boardRoute) {
        const boardId = boardRoute[1]!;
        const action = boardRoute[2]!;
        const meta = {
          board: { id: boardId, title: 'Board', syncSeq: '30', archived: false, repoFingerprint: null, repoBrowseUrl: null },
          lists: [{ id: 'l1', title: 'Start', workflowRole: 'START', position: 'a' }],
          labels: [],
          members: [],
          capabilities: {
            formatVersions: [2],
            cardStatuses: ['todo', 'in_progress', 'blocked', 'cancelled', 'done'],
            blockerTypes: ['decision'],
            decisions: true,
            simpleDoc: true,
            approval: true,
          },
          limits: { pushOps: 100, pushBytes: 1_000_000, changesPage: 200, simpleDocBytes: 100_000, descriptionChars: 8000 },
          serverTimeMs: Date.now(),
          minCliVersion: '0.0.0',
        };
        if (action === 'meta') return send(200, meta);
        if (action === 'changes') return send(200, { cards: [], toSeq: '30', hasMore: false, tombstones: [] });
        if (action === 'manifest') return send(200, { stale: [], unknown: [], archived: [], deleted: [], syncSeq: '30' });
        if (action === 'bind' && method === 'POST') return send(200, { meta, warnings: [] });
        if (action === 'push' && method === 'POST') {
          return send(200, { serverTimeMs: Date.now(), syncSeq: '31', results: [] });
        }
      }

      if (path === '/v1/sync/validation' && method === 'POST') return send(200, { ok: true });
      send(404, { code: 'NOT_FOUND', message: path });
    });

    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
    server.on('error', reject);
  });
}
