import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from '@rodo/card-format';
import { scanCards, type CardFile, type ScanOptions } from '../core/cards';
import type { ProjectRef } from '../core/discovery';
import { CliError } from '../core/errors';
import { writeAtomic, writeJson } from '../core/fs-atomic';
import { acquireLock } from '../core/lock';

const ERROR_LINE = /^<!--\s*RODO_ERROR:.*-->\s*$/;

/** ref/11 §8: `<!-- RODO_ERROR: <message> (+<k> more: rodo/<project>/.rodo/last-sync.json) -->`, errors only. */
export function errorMarker(slug: string, errors: Finding[]): string | null {
  const first = errors[0];
  if (!first) return null;
  const msg = first.message.replace(/\s+/g, ' ').replace(/-->/g, '-- >');
  const more = errors.length > 1 ? ` (+${errors.length - 1} more: rodo/${slug}/.rodo/last-sync.json)` : '';
  return `<!-- RODO_ERROR: ${msg}${more} -->`;
}

/** Sets, replaces or removes the one marker on line 1. Keeps BOM and line endings. Returns null when nothing changes. */
export function withMarker(raw: string, marker: string | null): string | null {
  const bom = raw.charCodeAt(0) === 0xfeff ? '﻿' : '';
  const text = bom ? raw.slice(1) : raw;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const nl = text.indexOf('\n');
  const first = nl < 0 ? text : text.slice(0, nl).replace(/\r$/, '');
  const rest = ERROR_LINE.test(first) ? (nl < 0 ? '' : text.slice(nl + 1)) : text;
  const next = bom + (marker ? marker + eol : '') + rest;
  return next === raw ? null : next;
}

export interface SyncFileReport {
  path: string;
  cardId: string | null;
  errors: { code: string; line: number | null; message: string }[];
  warnings: { code: string; line: number | null; message: string }[];
}

export interface LastSync {
  version: 1;
  project: string;
  startedAt: number;
  finishedAt: number;
  mode: 'offline' | 'online';
  clock: { source: 'system' | 'server'; offsetMs: number };
  pulled: number;
  pushed: number;
  created: number;
  archived: number;
  conflicts: { path: string; field: string; winner: string; localValue?: string; localCopy?: string }[];
  files: SyncFileReport[];
  summary: { files: number; errors: number; warnings: number };
  notes: string[];
}

const slim = (f: Finding) => ({ code: f.code, line: f.line, message: f.message });

/** Findings that do not come from the file itself (server answers of this run), by project-relative path. */
export type ExtraFindings = Map<string, { errors: Finding[]; warnings: Finding[] }>;

export function buildReport(
  slug: string,
  cards: CardFile[],
  startedAt: number,
  over: Partial<Pick<LastSync, 'mode' | 'clock' | 'pulled' | 'pushed' | 'created' | 'archived' | 'conflicts' | 'notes'>> = {},
  extra: ExtraFindings = new Map(),
): LastSync {
  const merged = cards.map((c) => {
    const x = extra.get(c.path);
    return { c, errors: [...c.errors, ...(x?.errors ?? [])], warnings: [...c.warnings, ...(x?.warnings ?? [])] };
  });
  const files = merged
    .filter((m) => m.errors.length || m.warnings.length)
    .map((m): SyncFileReport => ({ path: m.c.path, cardId: m.c.model?.id ?? null, errors: m.errors.map(slim), warnings: m.warnings.map(slim) }));
  return {
    version: 1, project: slug, startedAt, finishedAt: Date.now(), mode: 'offline',
    clock: { source: 'system', offsetMs: 0 },
    pulled: 0, pushed: 0, created: 0, archived: 0, conflicts: [],
    notes: ['OFFLINE: cards were validated only'],
    ...over,
    files,
    summary: { files: cards.length, errors: merged.reduce((n, m) => n + m.errors.length, 0), warnings: merged.reduce((n, m) => n + m.warnings.length, 0) },
  };
}

/**
 * Writes or removes the line-1 marker of every card. The marker line shifts later line numbers by one, so the
 * cards are rescanned until the markers say what the findings say. Returns the final scan.
 */
export function applyMarkers(root: string, ref: ProjectRef, scanOpts: ScanOptions = {}, extra: ExtraFindings = new Map(), dryRun = false): CardFile[] {
  let cards = scanCards(root, ref, [], scanOpts);
  for (let pass = 0; pass < 3 && !dryRun; pass++) {
    let changed = false;
    for (const c of cards) {
      // not UTF-8: a text rewrite would replace the bad bytes for good, so the file is only reported
      if (c.errors.some((e) => e.code === 'ENCODING_INVALID')) continue;
      const raw = readFileSync(c.abs, 'utf8');
      const errors = [...c.errors, ...(extra.get(c.path)?.errors ?? [])];
      const next = withMarker(raw, errorMarker(ref.slug, errors));
      if (next !== null) {
        writeAtomic(c.abs, next);
        changed = true;
      }
    }
    if (!changed) break;
    cards = scanCards(root, ref, [], scanOpts);
  }
  return cards;
}

/** R5: validate, write/remove the line-1 marker, write last-sync.json. Always ends normally (exit 0). */
export async function runOfflineSync(
  root: string,
  ref: ProjectRef,
  opts: { dryRun?: boolean; lockWaitMs?: number; notes?: string[] } = {},
): Promise<{ report: LastSync; cards: CardFile[] }> {
  const startedAt = Date.now();
  const lockPath = join(ref.dir, '.rodo', 'sync.lock');
  const release = opts.dryRun ? () => {} : await acquireLock(lockPath, opts.lockWaitMs);
  if (!release) throw new CliError('SYNC_LOCKED', `SYNC_LOCKED: another rodo sync is running for ${ref.slug}`, 5);
  try {
    const cards = applyMarkers(root, ref, {}, new Map(), opts.dryRun);
    const report = buildReport(ref.slug, cards, startedAt, opts.notes ? { notes: opts.notes } : {});
    if (!opts.dryRun) writeJson(join(ref.dir, '.rodo', 'last-sync.json'), report);
    return { report, cards };
  } finally {
    release();
  }
}
