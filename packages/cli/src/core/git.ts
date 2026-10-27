import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256 } from './fs-atomic';

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export const isGitRepo = (root: string): boolean => git(root, ['rev-parse', '--git-dir']) !== null;
export const gitHead = (root: string): string | null => git(root, ['rev-parse', 'HEAD']);
export const gitBranch = (root: string): string | null => git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
export const isShallow = (root: string): boolean => git(root, ['rev-parse', '--is-shallow-repository']) === 'true';
/** sha256 of the root commit; null for shallow clones or empty repos (ref/13 step 11). */
export function rootCommit(root: string): string | null {
  if (isShallow(root)) return null;
  const out = git(root, ['rev-list', '--max-parents=0', 'HEAD']);
  return out ? out.split('\n').sort()[0]! : null;
}
/** ref/13 step 11: `sha256:` + sha256 of the root commit id. Null when it cannot be known. */
export function repoFingerprint(root: string): string | null {
  const c = rootCommit(root);
  return c ? sha256(c) : null;
}
/** tracked files under `pathspec` (forward slashes); null when git is unavailable. */
export function lsFiles(root: string, pathspec: string[]): string[] | null {
  const out = git(root, ['ls-files', '--', ...pathspec]);
  return out === null ? null : out.split('\n').filter(Boolean);
}
/** `git mv`, falling back to a plain rename (untracked files, no git). Never overwrites. */
export function moveFile(root: string, from: string, to: string, useGit: boolean): void {
  if (existsSync(to)) throw new Error(`target exists: ${to}`);
  mkdirSync(dirname(to), { recursive: true });
  if (useGit && git(root, ['mv', from, to]) !== null) return;
  renameSync(from, to);
}

/** `github.com/owner/repo` from the origin URL, with any credentials removed (ref/12 repoRemoteHint). */
export function remoteHint(root: string): string | null {
  const url = git(root, ['remote', 'get-url', 'origin']);
  if (!url) return null;
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[/:](.+?)(?:\.git)?\/?$/i.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}
