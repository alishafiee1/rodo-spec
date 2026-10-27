import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSync } from '../src/commands/sync';
import { errorMarker, withMarker } from '../src/sync/offline';
import { acquireLock } from '../src/core/lock';
import { addCycle, cardText, exec, initProject, legacyRepo, tempRepo } from './helpers/temp-repo';

const CARD = 'rodo/shop/cycles/003-x/card.rodo.md';
async function project() {
  const repo = tempRepo();
  await initProject(repo);
  return repo;
}
const sync = (repo: ReturnType<typeof tempRepo>, a: Parameters<typeof runSync>[1] = { offline: true }, wait = 0) =>
  exec(repo, (ctx) => runSync(ctx, a, wait));

describe('rodo sync --offline (R5)', () => {
  it('marks an invalid card on line 1, exits 0 and writes last-sync.json', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-x', cardText({ status: 'doing', folder: '003-x' }));
    const r = await sync(repo);
    expect(r.code).toBe(0);
    expect(repo.read(CARD).split('\n')[0]).toMatch(/^<!-- RODO_ERROR: STATUS_INVALID/);
    const last = JSON.parse(repo.read('rodo/shop/.rodo/last-sync.json'));
    expect(last).toMatchObject({ version: 1, project: 'shop', mode: 'offline', pulled: 0, pushed: 0 });
    expect(last.files[0].errors[0].code).toBe('STATUS_INVALID');
    expect(last.summary.errors).toBe(1);
  });

  it('line numbers count the marker line, also on the first run', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-x', cardText({ status: 'doing', folder: '003-x' }));
    const r = await sync(repo);
    // frontmatter: --- schemaVersion title status  -> status is file line 5 once the marker is line 1
    expect(r.stdout).toContain('cycles/003-x/card.rodo.md:5');
    expect(JSON.parse(repo.read('rodo/shop/.rodo/last-sync.json')).files[0].errors[0].line).toBe(5);
  });

  it('keeps exactly one marker over repeated runs', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-x', cardText({ status: 'doing', folder: '003-x' }));
    await sync(repo);
    const once = repo.read(CARD);
    await sync(repo);
    await sync(repo);
    expect(repo.read(CARD)).toBe(once);
    expect(repo.read(CARD).match(/RODO_ERROR/g)).toHaveLength(1);
  });

  it('removes the marker when the card becomes valid', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-x', cardText({ status: 'doing', folder: '003-x' }));
    await sync(repo);
    repo.write(CARD, repo.read(CARD).replace('status: doing', 'status: todo'));
    await sync(repo);
    expect(repo.read(CARD)).not.toContain('RODO_ERROR');
    expect(repo.read(CARD).startsWith('---\n')).toBe(true);
  });

  it('adds "(+k more: …)" when there are several errors, and only errors go to line 1', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-x', cardText({ status: 'doing', extraFm: 'priority: huge', folder: '003-x' }));
    await sync(repo);
    const line = repo.read(CARD).split('\n')[0]!;
    expect(line).toMatch(/\(\+1 more: rodo\/shop\/\.rodo\/last-sync\.json\) -->$/);
    // a warning-only card gets no marker
    addCycle(repo, 'shop', '004-y', cardText({ folder: '004-y' }).replace('## Refs', '## Notes'));
    await sync(repo);
    expect(repo.read('rodo/shop/cycles/004-y/card.rodo.md')).not.toContain('RODO_ERROR');
  });

  it('keeps CRLF and BOM when it writes the marker', async () => {
    const repo = await project();
    const text = '﻿' + cardText({ status: 'doing', folder: '003-x' }).replace(/\n/g, '\r\n');
    addCycle(repo, 'shop', '003-x', text);
    await sync(repo);
    const raw = readFileSync(join(repo.root, CARD), 'utf8');
    expect(raw.startsWith('﻿<!-- RODO_ERROR')).toBe(true);
    expect(raw).not.toMatch(/[^\r]\n/);
    await sync(repo);
    expect(readFileSync(join(repo.root, CARD), 'utf8')).toBe(raw);
  });

  it('plain "rodo sync" with no server behaves like --offline and says OFFLINE', async () => {
    const repo = await project();
    const r = await sync(repo, {});
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OFFLINE');
  });

  it('--dry-run writes no marker and no report', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-x', cardText({ status: 'doing', folder: '003-x' }));
    const before = repo.read(CARD);
    await sync(repo, { offline: true, dryRun: true });
    expect(repo.read(CARD)).toBe(before);
    expect(existsSync(join(repo.root, 'rodo/shop/.rodo/last-sync.json'))).toBe(false);
  });

  it('exit 5 SYNC_LOCKED when another sync holds the lock', async () => {
    const repo = await project();
    const release = await acquireLock(join(repo.root, 'rodo/shop/.rodo/sync.lock'), 0);
    const r = await sync(repo);
    expect(r.code).toBe(5);
    expect(r.stdout).toContain('SYNC_LOCKED');
    release!();
    expect((await sync(repo)).code).toBe(0);
  });

  it('takes over a lock older than 10 minutes', async () => {
    const repo = await project();
    const p = join(repo.root, 'rodo/shop/.rodo/sync.lock');
    repo.write('rodo/shop/.rodo/keep', '');
    writeFileSync(p, JSON.stringify({ pid: 1, host: 'x', startedAt: Date.now() - 11 * 60_000 }));
    expect((await sync(repo)).code).toBe(0);
    expect(existsSync(p)).toBe(false);
  });

  it('refuses to sync the legacy layout (exit 3) but still reports it', async () => {
    const r = await sync(legacyRepo());
    expect(r.code).toBe(3);
    expect(r.stdout).toContain('LEGACY_LAYOUT');
  });

  it('never rewrites a file that is not UTF-8; it only reports ENCODING_INVALID', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-x', 'placeholder');
    const p = join(repo.root, CARD);
    writeFileSync(p, Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a]));
    const before = readFileSync(p);
    const r = await sync(repo);
    expect(readFileSync(p).equals(before)).toBe(true);
    expect(r.stdout).toContain('ENCODING_INVALID');
  });
});

describe('marker helpers', () => {
  it('errorMarker is null without errors and sanitises "-->"', () => {
    expect(errorMarker('shop', [])).toBeNull();
    const m = errorMarker('shop', [{ code: 'X', line: 1, message: 'X: bad --> value' }])!;
    expect(m).toBe('<!-- RODO_ERROR: X: bad -- > value -->');
  });

  it('withMarker returns null when nothing changes', () => {
    expect(withMarker('---\na\n---\n', null)).toBeNull();
    expect(withMarker('<!-- RODO_ERROR: X -->\n---\n', '<!-- RODO_ERROR: X -->')).toBeNull();
  });
});
