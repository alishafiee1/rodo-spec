import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCard } from '@rodo/card-format';
import type { CardState } from '@rodo/protocol';
import type { CardFile } from '../src/core/cards';
import { materializePath, moveToTrash, regenerate, writeCard } from '../src/sync/write-back';
import { newState, readBase } from '../src/sync/state';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'rodo-wb-'));
  dirs.push(d);
  return d;
};

const state = (over: Partial<CardState> = {}): CardState => ({
  id: 'clx9n4c5d0002gm01discnt2', rev: '42', updatedAt: 1791350000123, archived: false, deleted: false, rodoPath: null,
  title: 'لغو سفارش', description: 'شرح.\n\n## Progress notes\n\n- Done: api', status: 'in_progress', list: 'در حال انجام', statusReason: null, blockerType: null,
  priority: 'high', coverColor: null, startAt: null, dueAt: null, hours: null,
  financial: { type: 'none', amount: 0, category: 'general', date: null }, scope: { allowed: [], forbidden: [] }, test: { adapter: null, command: null },
  members: [], labels: [], locked: false, refs: [], decisions: [], checklists: [], simpleDoc: null, fieldRevs: {},
  ...over,
});

const local = (dir: string, path: string, text: string): CardFile => {
  writeFileSync(join(dir, path), text);
  const parsed = parseCard(text);
  return { path, abs: join(dir, path), text, model: parsed.model, errors: [], warnings: [], key: 'k', number: null, mtimeMs: 0 };
};

describe('regenerate keeps what only the file knows (R11)', () => {
  it('keeps workflow, x-* keys and CRLF; writes server id, updatedAt; drops the stale list key', () => {
    const dir = tmp();
    const text = ['---', 'schemaVersion: 2', 'title: قدیمی', 'status: todo', 'list: برنامه‌ریزی', 'workflow: major', 'x-owner: masoud', '---', '', 'قدیمی', ''].join('\r\n');
    const f = local(dir, 'a.rodo.md', text);
    const out = regenerate(state(), f);
    expect(out).toContain('workflow: major');
    expect(out).toContain('x-owner: masoud');
    expect(out).toContain('id: clx9n4c5d0002gm01discnt2');
    expect(out).toContain('updatedAt: 1791350000123');
    expect(out).toContain('title: لغو سفارش');
    expect(out).not.toContain('list:');
    expect(out).not.toMatch(/[^\r]\n/);
    expect(parseCard(out).errors).toEqual([]);
  });

  it('a card with no local file starts from the canonical form', () => {
    const out = regenerate(state({ members: ['sara'], labels: [] }), null);
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('members: [sara]');
    expect(out).not.toContain('workflow');
  });

  it('is stable: regenerating a file from the same state gives the same bytes', () => {
    const dir = tmp();
    const first = regenerate(state(), null);
    const f = local(dir, 'b.rodo.md', first);
    expect(regenerate(state(), f)).toBe(first);
  });

  it('round-trips checklists, decisions and refs', () => {
    const s = state({
      refs: [{ id: 'refaaaa001', title: 'سرویس', path: '/src/a.ts' }],
      decisions: [{ id: 'decaaaa001', question: 'q؟', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }], state: 'answered', answer: { key: 'A', note: 'چون', by: 'm', at: 1 } }],
      checklists: [{ id: 'chkaaaa001', title: 'قدم‌ها', rev: '3', items: [
        { id: 'itmaaaa001', title: 'اول', isDone: true, assignee: 'sara', minutes: 70, kind: 'task', rev: '3' },
        { id: 'itmaaaa002', title: 'تأیید', isDone: false, assignee: null, minutes: 0, kind: 'approval', rev: '3' },
      ] }],
    });
    const m = parseCard(regenerate(s, null)).model!;
    expect(m.refs).toMatchObject([{ id: 'refaaaa001', path: '/src/a.ts' }]);
    expect(m.decisions[0]).toMatchObject({ id: 'decaaaa001', answer: { key: 'A', note: 'چون' } });
    expect(m.checklists[0]!.items.map((i) => [i.id, i.isDone, i.kind, i.minutes])).toEqual([['itmaaaa001', true, 'task', 70], ['itmaaaa002', false, 'approval', 0]]);
  });
});

describe('writeCard and moveToTrash', () => {
  it('writes the file, the base copy and the state entry together', () => {
    const dir = tmp();
    const st = newState({ serverUrl: 'http://x', apiBaseUrl: 'http://x', boardId: 'b' });
    mkdirSync(join(dir, 'cycles'), { recursive: true });
    const e = writeCard(dir, st, state(), 'cycles/a.rodo.md', null, { lastSyncAt: 1000, simpleDocHash: 'sha256:s', simpleDocBranch: 'main' });
    expect(readFileSync(join(dir, 'cycles/a.rodo.md'), 'utf8')).toContain('title: لغو سفارش');
    expect(readBase(dir, 'clx9n4c5d0002gm01discnt2')!.rev).toBe('42');
    expect(st.cards['clx9n4c5d0002gm01discnt2']).toEqual(e);
    expect(e).toMatchObject({ baseRev: '42', lastSyncAt: 1000, simpleDocHash: 'sha256:s', simpleDocBranch: 'main', path: 'cycles/a.rodo.md' });
    // a later write without simple.md info keeps what was known
    const e2 = writeCard(dir, st, state({ rev: '43' }), 'cycles/a.rodo.md', null, { lastSyncAt: 2000 });
    expect(e2).toMatchObject({ baseRev: '43', simpleDocHash: 'sha256:s' });
  });

  it('moveToTrash keeps the text and forgets the card; a second file of the same name does not overwrite', () => {
    const dir = tmp();
    const st = newState({ serverUrl: 'http://x', apiBaseUrl: 'http://x', boardId: 'b' });
    writeCard(dir, st, state(), 'a.rodo.md', null, { lastSyncAt: 1 });
    const text = readFileSync(join(dir, 'a.rodo.md'), 'utf8');
    const dest = moveToTrash(dir, st, 'clx9n4c5d0002gm01discnt2', 'a.rodo.md')!;
    expect(readFileSync(dest, 'utf8')).toBe(text);
    expect(st.cards['clx9n4c5d0002gm01discnt2']).toBeUndefined();
    expect(readBase(dir, 'clx9n4c5d0002gm01discnt2')).toBeNull();
    writeFileSync(join(dir, 'a.rodo.md'), 'second');
    const dest2 = moveToTrash(dir, st, null, 'a.rodo.md')!;
    expect(dest2).not.toBe(dest);
    expect(readFileSync(dest, 'utf8')).toBe(text);
  });

  it('a missing file just drops the entry', () => {
    const dir = tmp();
    const st = newState({ serverUrl: 'http://x', apiBaseUrl: 'http://x', boardId: 'b' });
    expect(moveToTrash(dir, st, 'x', 'nope.rodo.md')).toBeNull();
  });
});

describe('materializePath', () => {
  it('uses the card path when its folder exists and the file does not; otherwise inbox/ with the id tail', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'cycles/004-x'), { recursive: true });
    expect(materializePath(dir, state({ rodoPath: 'cycles/004-x/card.rodo.md' }))).toBe('cycles/004-x/card.rodo.md');
    writeFileSync(join(dir, 'cycles/004-x/card.rodo.md'), 'x');
    expect(materializePath(dir, state({ rodoPath: 'cycles/004-x/card.rodo.md' }))).toMatch(/^inbox\/.+-1discnt2\.rodo\.md$/);
    expect(materializePath(dir, state({ rodoPath: 'cycles/999-none/card.rodo.md' }))).toMatch(/^inbox\//);
    expect(materializePath(dir, state({ rodoPath: '../evil/card.rodo.md' }))).toMatch(/^inbox\//);
    expect(materializePath(dir, state({ rodoPath: '/abs/card.rodo.md' }))).toMatch(/^inbox\//);
    expect(materializePath(dir, state({ title: 'سلام دنیا', rodoPath: null }))).toBe('inbox/سلام-دنیا-1discnt2.rodo.md');
  });
});

describe('Progress notes survive a board edit that dropped them (dogfood P1-1)', () => {
  it('keeps the local Progress notes when the board description has none', () => {
    const dir = tmp();
    const text = ['---', 'schemaVersion: 2', 'title: t', 'status: in_progress', '---', '', 'قدیمی', '', '## Progress notes', '', '- Done: api', '- Remaining: ui', '', '## Refs', ''].join('\n');
    const f = local(dir, 'a.rodo.md', text);
    const out = regenerate(state({ description: 'متن تازه از وب' }), f);
    expect(out).toContain('متن تازه از وب');
    expect(out).toContain('## Progress notes');
    expect(out).toContain('- Remaining: ui');
    expect(parseCard(out).model!.description).toBe('متن تازه از وب\n\n## Progress notes\n\n- Done: api\n- Remaining: ui');
  });
  it('uses the board notes when the board still has a Progress notes section', () => {
    const dir = tmp();
    const text = ['---', 'schemaVersion: 2', 'title: t', 'status: in_progress', '---', '', 'x', '', '## Progress notes', '', '- Done: old', ''].join('\n');
    const out = regenerate(state(), local(dir, 'a.rodo.md', text));
    expect(out).toContain('- Done: api');
    expect(out).not.toContain('- Done: old');
  });
});

import { conflictValue, saveLocalCopy } from '../src/sync/write-back';
describe('a lost conflict keeps your text (dogfood P1-2)', () => {
  it('saveLocalCopy copies the file into .rodo/conflicts and returns a posix path', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'a.rodo.md'), 'mine');
    const rel = saveLocalCopy(dir, 'cid', join(dir, 'a.rodo.md'), 123);
    expect(rel).toBe('.rodo/conflicts/cid.local-123.rodo.md');
    expect(readFileSync(join(dir, rel), 'utf8')).toBe('mine');
  });
  it('conflictValue prints simple fields only', () => {
    const m = parseCard('---\nschemaVersion: 2\ntitle: "محلی"\nstatus: todo\npriority: high\n---\n\nx\n').model!;
    expect(conflictValue(m, 'title')).toBe('محلی');
    expect(conflictValue(m, 'priority')).toBe('high');
    expect(conflictValue(m, 'checklists')).toBeUndefined();
  });
});
