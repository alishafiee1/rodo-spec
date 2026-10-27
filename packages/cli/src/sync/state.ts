import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CardState, MetaResponse } from '@rodo/protocol';
import { readJson, writeJson } from '../core/fs-atomic';

// note --- ref/12 §4: rodo/<project>/.rodo/state.json and .rodo/base/<cardId>.json ---

export interface CardEntry {
  /** project-relative path of the file */
  path: string;
  baseRev: string;
  /** `canonicalHash` of the base model */
  baseHash: string;
  /** hash of the bytes this CLI last wrote or read */
  fileHash: string;
  simpleDocHash: string | null;
  simpleDocBranch: string | null;
  /** server-corrected ms of the last time this card's base was written (lower bound of editedAt, G1) */
  lastSyncAt: number;
}

export interface SyncState {
  schemaVersion: 1;
  serverUrl: string;
  apiBaseUrl: string;
  boardId: string;
  deviceId: string;
  lastSeq: string;
  lastSyncAt: number | null;
  clock: { offsetMs: number; source: 'server' | 'system' };
  materialize: 'ALL' | 'MINE' | 'NONE';
  meta: MetaResponse | null;
  cards: Record<string, CardEntry>;
  pendingCreates: Record<string, { path: string; firstPushAt: number }>;
}

const statePath = (dir: string) => join(dir, '.rodo', 'state.json');
const basePath = (dir: string, id: string) => join(dir, '.rodo', 'base', `${id}.json`);

export function readState(dir: string): SyncState | null {
  return readJson<SyncState>(statePath(dir));
}

export const newState = (init: { serverUrl: string; apiBaseUrl: string; boardId: string; deviceId?: string }): SyncState => ({
  schemaVersion: 1,
  serverUrl: init.serverUrl,
  apiBaseUrl: init.apiBaseUrl,
  boardId: init.boardId,
  deviceId: init.deviceId ?? '',
  lastSeq: '0',
  lastSyncAt: null,
  clock: { offsetMs: 0, source: 'system' },
  materialize: 'ALL',
  meta: null,
  cards: {},
  pendingCreates: {},
});

export function writeState(dir: string, s: SyncState): void {
  writeJson(statePath(dir), s);
}

export const readBase = (dir: string, id: string): CardState | null => readJson<CardState>(basePath(dir, id));

export function writeBase(dir: string, card: CardState): void {
  mkdirSync(join(dir, '.rodo', 'base'), { recursive: true });
  writeJson(basePath(dir, card.id), card);
}

export function dropBase(dir: string, id: string): void {
  if (existsSync(basePath(dir, id))) rmSync(basePath(dir, id));
}
