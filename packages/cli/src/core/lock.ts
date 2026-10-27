import { mkdirSync, openSync, closeSync, writeSync, unlinkSync, readFileSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

const STALE_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ref/12 §4: `.rodo/sync.lock`; wait up to `waitMs` (30 s in the CLI), take over a lock older than 10 min. Returns release(), or null when still locked. */
export async function acquireLock(path: string, waitMs = 30_000): Promise<(() => void) | null> {
  mkdirSync(dirname(path), { recursive: true });
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), startedAt: Date.now() }));
      closeSync(fd);
      return () => { try { unlinkSync(path); } catch { /* already gone */ } };
    } catch {
      let startedAt = 0;
      try { startedAt = (JSON.parse(readFileSync(path, 'utf8')) as { startedAt?: number }).startedAt ?? statSync(path).mtimeMs; } catch { /* unreadable: treat as stale */ }
      if (Date.now() - startedAt > STALE_MS) { try { unlinkSync(path); } catch { /* raced */ } continue; }
      if (Date.now() >= deadline) return null;
      await sleep(200);
    }
  }
}
