import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, sha256, writeAtomic, writeJson, posix } from '../core/fs-atomic';

export interface KitManifest {
  version: string;
  files: { src: string; dest: string; owner: 'kit' }[];
  legacyHashes?: Record<string, string[]>;
  projectTemplate: { src: string; dest: string; owner: 'project' }[];
  /** English project template (kit 2.2+); `language.simple: "en"` projects use it */
  projectTemplateEn?: { src: string; dest: string; owner: 'project' }[];
}

export interface KitJson {
  kitVersion: string;
  kitRepo?: string;
  kitRef?: string;
  files: Record<string, string>;
}

export const BLOCK_START = '<!-- rodo:start -->';
export const BLOCK_END = '<!-- rodo:end -->';

/** Where the kit lives: `dist/kit` next to the bundle, or `packages/rodo-kit` when running from source. */
export function kitDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const c of [process.env.RODO_KIT_DIR, join(here, 'kit'), join(here, '../../rodo-kit'), join(here, '../../../rodo-kit')]) {
    if (c && existsSync(join(c, 'kit-manifest.json'))) return c;
  }
  throw new Error('bundled kit not found (kit-manifest.json)');
}

export function loadKit(): { dir: string; manifest: KitManifest; read: (src: string) => Buffer } {
  const dir = kitDir();
  return { dir, manifest: JSON.parse(readFileSync(join(dir, 'kit-manifest.json'), 'utf8')) as KitManifest, read: (s) => readFileSync(join(dir, s)) };
}

const lf = (s: string): string => s.replace(/\r\n/g, '\n');
export const readKitJson = (root: string): KitJson | null => readJson<KitJson>(join(root, 'rodo', 'kit.json'));

/** The kit version a repo has now: kit.json, else kit 2.0's `rodo/.kit-version`. */
export function installedKitVersion(root: string): string | null {
  const k = readKitJson(root);
  if (k) return k.kitVersion;
  const legacy = join(root, 'rodo', '.kit-version');
  return existsSync(legacy) ? readFileSync(legacy, 'utf8').trim() || null : null;
}

export interface KitReport {
  written: string[];
  updated: string[];
  unchanged: string[];
  kept: string[];
  from: string | null;
  to: string;
  blocks: string[];
}

/** ref/13 §2 step 2 + R1: never overwrite a file the user changed. */
export function installKit(root: string, opts: { dryRun?: boolean } = {}): KitReport {
  const kit = loadKit();
  const prev = readKitJson(root);
  const recorded = prev?.files ?? {};
  const files: Record<string, string> = { ...recorded };
  const rep: KitReport = { written: [], updated: [], unchanged: [], kept: [], from: installedKitVersion(root), to: kit.manifest.version, blocks: [] };

  for (const f of kit.manifest.files) {
    const dest = join(root, f.dest);
    const bytes = kit.read(f.src);
    const newHash = sha256(bytes);
    const key = posix(f.dest);
    if (!existsSync(dest)) {
      if (!opts.dryRun) writeAtomic(dest, bytes);
      files[key] = newHash;
      rep.written.push(key);
      continue;
    }
    const cur = readFileSync(dest);
    const curHash = sha256(cur);
    if (curHash === newHash) { files[key] = newHash; rep.unchanged.push(key); continue; }
    const legacy = kit.manifest.legacyHashes?.[key] ?? [];
    const untouched = curHash === recorded[key] || legacy.includes(sha256(lf(cur.toString('utf8'))));
    if (untouched) {
      if (!opts.dryRun) writeAtomic(dest, bytes);
      files[key] = newHash;
      rep.updated.push(key);
    } else {
      if (!opts.dryRun) writeAtomic(`${dest}.rodo-new`, bytes);
      rep.kept.push(key);
    }
  }

  const block = lf(kit.read('agents-block.md').toString('utf8')).trimEnd();
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    if (ensureBlock(join(root, name), block, kit.manifest.legacyHashes?.[name] ?? [], name === 'CLAUDE.md', opts.dryRun)) rep.blocks.push(name);
  }

  if (!opts.dryRun) {
    writeJson(join(root, 'rodo', 'kit.json'), {
      kitVersion: kit.manifest.version,
      ...(prev?.kitRepo ? { kitRepo: prev.kitRepo } : {}),
      ...(prev?.kitRef ? { kitRef: prev.kitRef } : {}),
      files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
    } satisfies KitJson);
  }
  return rep;
}

/**
 * AGENTS.md / CLAUDE.md: replace the marked block in place; otherwise append it, leaving the rest alone.
 * A file that is exactly the kit 2.0 text is replaced by the block. A CLAUDE.md that already imports AGENTS.md gets no block.
 */
export function ensureBlock(path: string, block: string, kit20Hashes: string[], importsAgents: boolean, dryRun = false): boolean {
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, 'utf8') : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = lf(text);
  const withEol = (s: string) => (eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s);
  let next: string;
  const a = body.indexOf(BLOCK_START);
  const b = body.indexOf(BLOCK_END);
  if (a >= 0 && b > a) next = body.slice(0, a) + block + body.slice(b + BLOCK_END.length);
  else if (!exists) next = block + '\n';
  else if (importsAgents && /^@AGENTS\.md\s*$/m.test(body)) return false;
  else if (kit20Hashes.includes(sha256(body))) next = block + '\n';
  else next = body.replace(/\n*$/, '\n\n') + block + '\n';
  if (next === body) return false;
  if (!dryRun) writeAtomic(path, withEol(next));
  return true;
}

export function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}
