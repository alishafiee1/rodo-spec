import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { decodeCardBytes, parseCard, validateCard, type BoardMeta, type CardModel, type Finding } from '@rodo/card-format';
import type { ProjectRef } from './discovery';
import { posix } from './fs-atomic';

export interface CardFile {
  /** relative to the project folder, forward slashes: cycles/004-x/card.rodo.md */
  path: string;
  abs: string;
  text: string;
  model: CardModel | null;
  errors: Finding[];
  warnings: Finding[];
  /** cycle folder name (004-x) or the file name without .rodo.md */
  key: string;
  /** cycle number "004" or null */
  number: string | null;
  mtimeMs: number;
}

const CARD_RE = /\.rodo\.md$/i;

function walk(dir: string, isLegacy: boolean, out: string[] = []): string[] {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === '.rodo' || n === 'node_modules') continue;
      if (isLegacy && existsSync(join(p, 'project.json'))) continue; // another project, not ours
      walk(p, isLegacy, out);
    } else if (CARD_RE.test(n)) out.push(p);
  }
  return out;
}

export function cardKey(relPath: string): { key: string; number: string | null } {
  const seg = relPath.split('/');
  if (seg[0] === 'cycles' && seg.length >= 3) {
    const m = /^(\d{3})-/.exec(seg[1]!);
    return { key: seg[1]!, number: m ? m[1]! : null };
  }
  return { key: seg[seg.length - 1]!.replace(CARD_RE, ''), number: null };
}

export interface ScanOptions {
  /** the last synced model of a card (validation compares approvals, decisions and server-owned keys against it) */
  baseOf?: (id: string) => CardModel | null;
  meta?: BoardMeta | null;
}

/** Reads and validates every card file of a project (R4: writes nothing). `only` = absolute paths or folders to keep. */
export function scanCards(root: string, ref: ProjectRef, only: string[] = [], opts: ScanOptions = {}): CardFile[] {
  const keep = only.map((p) => resolve(p));
  const abs = walk(ref.dir, ref.legacy).filter((p) => !keep.length || keep.some((k) => p === k || p.startsWith(k + '\\') || p.startsWith(k + '/')));
  const mapPath = join(ref.dir, 'MAP.md');
  const mapText = existsSync(mapPath) ? readFileSync(mapPath, 'utf8') : null;

  const read = abs.map((p) => {
    const bytes = readFileSync(p);
    const dec = decodeCardBytes(bytes);
    return { p, rel: posix(relative(ref.dir, p)), bytes, dec };
  });
  // CARD_ID_DUPLICATE: the first path (sorted) keeps the id
  const knownIds: Record<string, string> = {};
  const idOf = new Map<string, string>();
  for (const r of read.sort((a, b) => a.rel.localeCompare(b.rel))) {
    const id = r.dec.error ? undefined : parseCard(r.dec.text).model?.id;
    if (id) idOf.set(r.rel, id);
    if (id && !knownIds[id]) knownIds[id] = r.rel;
  }

  return read.map((r): CardFile => {
    const { key, number } = cardKey(r.rel);
    const base = { path: r.rel, abs: r.p, key, number, mtimeMs: statSync(r.p).mtimeMs };
    if (r.dec.error) return { ...base, text: '', model: null, errors: [r.dec.error], warnings: [] };
    const v = validateCard(r.dec.text, {
      relPath: r.rel,
      projectSlug: ref.legacy ? null : ref.slug,
      boundBoardId: ref.project?.boardId ?? null,
      base: idOf.has(r.rel) ? (opts.baseOf?.(idOf.get(r.rel)!) ?? null) : null,
      meta: opts.meta ?? null,
      repoFileExists: (repoPath) => existsSync(join(root, repoPath.replace(/^\//, ''))),
      siblingFiles: readdirSync(join(r.p, '..')),
      mapText,
      knownIds,
    });
    return { ...base, text: r.dec.text, model: v.model, errors: v.errors, warnings: v.warnings };
  });
}

/** `004`, `4`, folder name, card id, or the last 8 characters of the id (ref/13 §6). */
export function findCard(cards: CardFile[], q: string): CardFile | null {
  const num = /^\d{1,3}$/.test(q) ? q.padStart(3, '0') : null;
  return (
    cards.find((c) => (num && c.number === num) || c.key === q || (c.model?.id && (c.model.id === q || (q.length === 8 && c.model.id.endsWith(q))))) ??
    // the cycle slug without its number: `rodo resume delete-note` (dogfood #10)
    cards.find((c) => c.number !== null && c.key.replace(/^\d{3}-/, '') === q) ??
    null
  );
}

/** "001 Title" for lists, without printing the number twice when the title already starts with it (dogfood #9). */
export function cardLabel(number: string | null, title: string, sep = ' '): string {
  if (!number) return title;
  const t = title.trim();
  return new RegExp(`^${number}(\\b|\\s|[—:.-])`).test(t) ? t : `${number}${sep}${t}`;
}
