import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeAtomic } from '../core/fs-atomic';

export interface StoredToken { token: string; deviceId: string; expiresAt: string }

/** `~/.rodo` (RODO_HOME in tests). */
export const rodoHome = (): string => process.env.RODO_HOME ?? join(homedir(), '.rodo');
export const credentialsPath = (): string => join(rodoHome(), 'credentials');

function restrict(path: string): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${process.env.USERNAME ?? ''}:F`], { stdio: 'ignore' });
    } catch {
      /* best effort: a user profile folder is private on Windows already */
    }
  } else chmodSync(path, 0o600);
}

export function readCredentials(): Record<string, StoredToken> {
  const p = credentialsPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, StoredToken>;
  } catch {
    return {};
  }
}

export function writeCredentials(all: Record<string, StoredToken>): void {
  mkdirSync(rodoHome(), { recursive: true, mode: 0o700 });
  writeAtomic(credentialsPath(), JSON.stringify(all, null, 2) + '\n');
  restrict(credentialsPath());
}

/** ref/15 §2: `rodo doctor` FAILs when the file can be read by others (POSIX only). */
export function credentialsTooOpen(): boolean {
  const p = credentialsPath();
  if (process.platform === 'win32' || !existsSync(p)) return false;
  return (statSync(p).mode & 0o077) !== 0;
}
