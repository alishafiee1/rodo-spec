import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { canonicalHash, cardStateToModel, keepProgressNotes, parseCard, serializeCard, type CardModel } from '@rodo/card-format';
import type { CardState } from '@rodo/protocol';
import type { CardFile } from '../core/cards';
import { sha256, writeAtomic } from '../core/fs-atomic';
import { dropBase, writeBase, type CardEntry, type SyncState } from './state';

// note --- P3b "File regeneration from CardState": keep local-only keys, line endings and the BOM; the canonical serializer writes the rest ---

/** The file text for a server card. `local` supplies what the server does not know: `workflow` (D20) and `x-*` keys. */
export function regenerate(card: CardState, local: CardFile | null): string {
  const m: CardModel = cardStateToModel(card);
  const keep = local?.model;
  if (keep) {
    if (keep.workflow) m.workflow = keep.workflow;
    m.extras = keep.extras;
    // a board edit that dropped the whole Progress notes section keeps the local notes; the next sync pushes them back
    m.description = keepProgressNotes(m.description, keep.description);
  }
  // the board picks the list from the status; a `list:` key in the file would go stale the moment status changes (LIST_STATUS_MISMATCH)
  delete m.list;
  m.updatedAt = card.updatedAt;
  m.locked = card.locked;
  const original = local ? readFileSync(local.abs, 'utf8') : undefined;
  return serializeCard(m, original !== undefined ? { original } : {});
}

/** Writes the file, the base copy and the state entry in one go. Returns the entry. */
export function writeCard(
  projectDir: string,
  state: SyncState,
  card: CardState,
  path: string,
  local: CardFile | null,
  extra: { simpleDocHash?: string | null; simpleDocBranch?: string | null; lastSyncAt: number },
): CardEntry {
  const text = regenerate(card, local);
  writeAtomic(join(projectDir, path), text);
  writeBase(projectDir, card);
  const prev = state.cards[card.id];
  const entry: CardEntry = {
    path,
    baseRev: card.rev,
    baseHash: canonicalHash(cardStateToModel(card)),
    fileHash: sha256(text),
    simpleDocHash: extra.simpleDocHash !== undefined ? extra.simpleDocHash : (prev?.simpleDocHash ?? null),
    simpleDocBranch: extra.simpleDocBranch !== undefined ? extra.simpleDocBranch : (prev?.simpleDocBranch ?? null),
    lastSyncAt: extra.lastSyncAt,
  };
  state.cards[card.id] = entry;
  return entry;
}

/** A file the board no longer has goes to `.rodo/trash/`, text intact (never deleted). */
export function moveToTrash(projectDir: string, state: SyncState, id: string | null, path: string): string | null {
  const abs = join(projectDir, path);
  if (!existsSync(abs)) {
    if (id) {
      delete state.cards[id];
      dropBase(projectDir, id);
    }
    return null;
  }
  let dest = join(projectDir, '.rodo', 'trash', basename(path));
  if (existsSync(dest)) dest = join(dirname(dest), `${Date.now()}-${basename(path)}`);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(abs, dest);
  if (id) {
    delete state.cards[id];
    dropBase(projectDir, id);
  }
  return dest;
}

/** `.rodo/conflicts/<id>.server.rodo.md`: the server copy of a card whose local file is invalid (SERVER_CHANGED_WHILE_INVALID). */
export function saveServerCopy(projectDir: string, card: CardState): void {
  writeAtomic(join(projectDir, '.rodo', 'conflicts', `${card.id}.server.rodo.md`), regenerate(card, null));
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'card';

/** Where a card that exists only on the board lands: its own path when that folder exists, else `inbox/` (ref/12 §7 step 4). */
export function materializePath(projectDir: string, card: CardState): string {
  const own = card.rodoPath;
  if (own && !own.startsWith('/') && !own.includes('..') && existsSync(dirname(join(projectDir, own))) && !existsSync(join(projectDir, own))) return own;
  let name = `${slug(card.title)}-${card.id.slice(-8)}.rodo.md`;
  if (existsSync(join(projectDir, 'inbox', name))) name = `${Date.now()}-${name}`;
  return `inbox/${name}`;
}

export const sameModelText = (a: string, b: string): boolean => {
  const x = parseCard(a).model;
  const y = parseCard(b).model;
  return !!x && !!y && canonicalHash(x) === canonicalHash(y);
};

/** `.rodo/conflicts/<id>.local-<ms>.rodo.md`: your file as it was before the board value won a conflict. Returns the project-relative path. */
export function saveLocalCopy(projectDir: string, id: string, abs: string, now = Date.now()): string {
  const rel = join('.rodo', 'conflicts', `${id}.local-${now}.rodo.md`);
  mkdirSync(dirname(join(projectDir, rel)), { recursive: true });
  copyFileSync(abs, join(projectDir, rel));
  return rel.split('\\').join('/');
}

/** A short printable form of a simple field's local value (title, status, priority...), else undefined. */
export function conflictValue(m: CardModel, field: string): string | undefined {
  const v = (m as unknown as Record<string, unknown>)[field === 'hours' ? 'hoursMinutes' : field];
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}...` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}
