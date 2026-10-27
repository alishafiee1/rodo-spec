import { describe, expect, it } from 'vitest';
import { cardLabel, findCard, type CardFile } from '../src/core/cards';
import { localTime, stamp, zoneName } from '../src/core/time';

const card = (key: string, number: string | null, id = 'cid00000000000000abcdefgh'): CardFile =>
  ({ path: `cycles/${key}/card.rodo.md`, abs: '', key, number, mtimeMs: 0, model: { id } as never, errors: [], warnings: [], text: '' }) as unknown as CardFile;

describe('labels and lookup (dogfood #9, #10)', () => {
  it('does not print the cycle number twice', () => {
    expect(cardLabel('001', '001 — پاک کردن یادداشت')).toBe('001 — پاک کردن یادداشت');
    expect(cardLabel('001', 'Delete a note')).toBe('001 Delete a note');
    expect(cardLabel('001', 'Delete a note', ' — ')).toBe('001 — Delete a note');
    expect(cardLabel('001', '0012 things')).toBe('001 0012 things');
  });
  it('finds a card by its slug without the number', () => {
    const cards = [card('001-delete-note', '001'), card('002-export', '002')];
    expect(findCard(cards, 'delete-note')?.key).toBe('001-delete-note');
    expect(findCard(cards, '2')?.key).toBe('002-export');
    expect(findCard(cards, '001-delete-note')?.key).toBe('001-delete-note');
    expect(findCard(cards, 'nothing')).toBeNull();
  });
});

describe('local time (dogfood #8)', () => {
  it('uses RODO_TZ, else the system zone, and labels the zone', () => {
    expect(zoneName({ RODO_TZ: 'Europe/Madrid' })).toBe('Europe/Madrid');
    expect(zoneName({ RODO_TZ: 'Not/AZone' })).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const ms = Date.UTC(2026, 9, 17, 8, 25);
    expect(localTime(ms, 'Europe/Madrid')).toBe('2026-10-17 10:25');
    expect(localTime(ms, 'Asia/Tehran')).toBe('2026-10-17 11:55');
    expect(stamp(ms, 'UTC')).toBe('2026-10-17 08:25 (UTC)');
  });
});
