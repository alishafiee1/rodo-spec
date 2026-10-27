import type { CardState, ChangesResponse } from '@rodo/protocol';
import { getToken } from '../auth/token-store';
import { discover } from '../net/discovery';
import { Http } from '../net/http';
import type { SyncState } from './state';

/** `rodo status` and `rodo doctor` look at the board without applying anything. Null = no server (offline, no token, not bound). */
export async function boardChanges(serverUrl: string | null, boardId: string | null, state: SyncState | null, cliVersion: string): Promise<{ cards: Map<string, CardState>; seq: string } | null> {
  if (!serverUrl || !boardId) return null;
  const tok = getToken(serverUrl);
  if (!tok) return null;
  try {
    const d = await discover(serverUrl);
    const http = new Http({ baseUrl: d.apiBaseUrl, token: tok.token, cliVersion, timeoutMs: 10_000 });
    const cards = new Map<string, CardState>();
    let since = state?.lastSeq ?? '0';
    let seq = since;
    for (let i = 0; i < 1000; i++) {
      const page = await http.get<ChangesResponse>(`/v1/sync/boards/${boardId}/changes`, { since, limit: 200 });
      for (const c of page.cards) cards.set(c.id, c);
      since = seq = page.toSeq;
      if (!page.hasMore) break;
    }
    return { cards, seq };
  } catch {
    return null;
  }
}
