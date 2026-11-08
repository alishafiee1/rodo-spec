import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** npm registry integrity for rodo-spec@2.6.0 (2026-11-04). */
export const NPM_RODO_SPEC_260_INTEGRITY =
  'sha512-bZA+bU2wrYMq+wCYNMXl33315pAKINU69gfS8EyrRN0Ojyvehp6mp7H3rQjOH8r+5hb7w/Eex4y1mf/adf3WsA==';

export const NPM_RODO_SPEC_260_SHASUM = 'c7c862160c195b1d5c52d3a10d64e70a0431d1a5';

const CACHE_ROOT = join(tmpdir(), 'rodo-spec-npm-260-pinned');
const TARBALL = join(CACHE_ROOT, 'rodo-spec-2.6.0.tgz');
const EXTRACT = join(CACHE_ROOT, 'package');

function verifyTarball(buf: Buffer): void {
  const got = `sha512-${createHash('sha512').update(buf).digest('base64')}`;
  if (got !== NPM_RODO_SPEC_260_INTEGRITY) {
    throw new Error(`rodo-spec@2.6.0 integrity mismatch: got ${got}`);
  }
}

/** Absolute path to `dist/index.js` from the pinned npm tarball (scripts never run). */
export function rodoNpm260Bin(): string {
  const bin = join(EXTRACT, 'dist/index.js');
  if (existsSync(bin)) return bin;
  mkdirSync(CACHE_ROOT, { recursive: true });
  if (!existsSync(TARBALL)) {
    execFileSync('npm', ['pack', 'rodo-spec@2.6.0', '--pack-destination', CACHE_ROOT], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  }
  verifyTarball(readFileSync(TARBALL));
  execFileSync('tar', ['-xzf', TARBALL, '-C', CACHE_ROOT], { stdio: 'ignore' });
  if (!existsSync(bin)) throw new Error(`npm 2.6.0 extract missing ${bin}`);
  const ver = JSON.parse(readFileSync(join(EXTRACT, 'package.json'), 'utf8')).version;
  if (ver !== '2.6.0') throw new Error(`expected 2.6.0, got ${ver}`);
  return bin;
}

export function freshHome(): string {
  return mkdtempSync(join(tmpdir(), 'rodo-home-npm260-'));
}
