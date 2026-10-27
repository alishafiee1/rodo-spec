// Regenerates kit-manifest.json from the files on disk. Run after adding or removing a kit file.
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(join(root, d)).flatMap((n) => {
  const p = `${d}/${n}`;
  return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
}).sort();

// hashes of kit 2.0.0 files: a user copy equal to one of these counts as "unchanged" (kit 2.0 had no rodo/kit.json)
const k20 = join(root, 'fixtures/kit-2.0.0');
const hash = (p) => 'sha256:' + createHash('sha256').update(readFileSync(p, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const legacyHashes = {};
if (existsSync(k20)) {
  for (const f of ['AGENTS.md', 'CLAUDE.md', ...walkAbs(join(k20, '.agents')).map((p) => p.slice(k20.length + 1).replaceAll('\\', '/'))]) {
    legacyHashes[f] = [hash(join(k20, f))];
  }
}
function walkAbs(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walkAbs(p) : [p];
  });
}

const version = readFileSync(join(root, 'KIT_VERSION'), 'utf8').trim();
const manifest = {
  version,
  files: walk('.agents').map((p) => ({ src: p, dest: p, owner: 'kit' })),
  legacyHashes,
  projectTemplate: walk('project-template').map((p) => ({ src: p, dest: p.replace('project-template/', ''), owner: 'project' })),
  projectTemplateEn: walk('project-template-en').map((p) => ({ src: p, dest: p.replace('project-template-en/', ''), owner: 'project' })),
};
writeFileSync(join(root, 'kit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
