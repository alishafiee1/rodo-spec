import { mkdirSync, renameSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

/** temp file + rename in the same folder (ref/12 §4). */
export function writeAtomic(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export const readText = (path: string): string => readFileSync(path, 'utf8');
export const readJson = <T>(path: string): T | null => {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readText(path)) as T; } catch { return null; }
};
export const writeJson = (path: string, v: unknown): void => writeAtomic(path, JSON.stringify(v, null, 2) + '\n');
export const sha256 = (b: string | Uint8Array): string => `sha256:${createHash('sha256').update(b).digest('hex')}`;
/** repo-relative reference: always forward slashes, whatever the OS. */
export const posix = (p: string): string => p.replaceAll(String.fromCharCode(92), '/');
