#!/usr/bin/env node
// rodo-update: updates the RODO method files from GitHub. Never touches rodo/ (only rodo/.kit-version),
// AGENTS.md, CLAUDE.md or your code.
//   node scripts/rodo-update.cjs [--repo URL] [--ref TAG|BRANCH] [--from LOCAL_KIT_DIR] [--dry-run] [--root DIR]
// Repo and ref default to "kitRepo"/"kitRef" in rodo/config.json.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const C = require('./lib/core.cjs');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const root = C.findRoot(opt('--root')), cfg = C.loadConfig(root), dry = args.includes('--dry-run');
let src = opt('--from'), tmp = null;
if (!src) {
  const repo = opt('--repo') || cfg.kitRepo, ref = opt('--ref') || cfg.kitRef;
  if (/OWNER/.test(repo)) { console.error('rodo-update: set "kitRepo" in rodo/config.json (or pass --repo URL)'); process.exit(2); }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rodo-kit-'));
  console.log(`rodo-update: fetching ${repo} (${ref})`);
  const r = cp.spawnSync('git', ['clone', '--quiet', '--depth', '1', '--branch', ref, repo, tmp], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('rodo-update: download failed; nothing was changed'); process.exit(1); }
  src = tmp;
}
src = path.resolve(src);
const mf = path.join(src, 'kit-manifest.json');
if (!C.exists(mf)) { console.error(`rodo-update: ${src} is not a RODO kit (no kit-manifest.json)`); process.exit(1); }
const manifest = JSON.parse(C.read(mf));
const newV = C.read(path.join(src, 'KIT_VERSION')).trim();
const vf = path.join(root, 'rodo', '.kit-version');
const oldV = C.exists(vf) ? C.read(vf).trim() : '(unknown)';
console.log(`rodo-update: ${oldV} -> ${newV}${dry ? ' (dry run, nothing written)' : ''}`);
const SAFE = (f) => !f.split('/').includes('..') && !path.isAbsolute(f) && !/^rodo(\/|$)/.test(f) && !/^(AGENTS|CLAUDE)\.md$/.test(f);
const changed = []; const removed = []; let same = 0;
const walk = (d, rel, out) => { if (!C.exists(d)) return out; if (!C.isDir(d)) { out.push(rel); return out; } for (const n of fs.readdirSync(d)) walk(path.join(d, n), `${rel}/${n}`, out); return out; };
for (const f of manifest.files) {
  if (!SAFE(f)) { console.error(`  skipped unsafe path in manifest: ${f}`); continue; }
  const rel0 = f.replace(/\/$/, ''); const from = path.join(src, rel0);
  if (!C.exists(from)) continue;
  const incoming = walk(from, rel0, []);
  if (C.isDir(from)) for (const old of walk(path.join(root, rel0), rel0, [])) if (!incoming.includes(old)) { removed.push(old); if (!dry) fs.rmSync(path.join(root, old)); } // drop files removed upstream
  for (const rel of incoming) {
    const a = path.join(src, rel), b = path.join(root, rel);
    if (C.exists(b) && fs.readFileSync(a).equals(fs.readFileSync(b))) { same++; continue; }
    changed.push(rel);
    if (!dry) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); }
  }
}
if (!dry) fs.writeFileSync(vf, newV + '\n');
for (const f of changed) console.log(`  ${dry ? 'would update' : 'updated'} ${f}`);
for (const f of removed) console.log(`  ${dry ? 'would remove' : 'removed'} ${f} (no longer in the kit)`);
console.log(`  ${same} kit file(s) already up to date`);
const mig = path.join(src, 'MIGRATION.md');
if (C.exists(mig) && oldV !== newV) console.log(`\nRead MIGRATION.md for ${oldV} -> ${newV}. Compare rodo/RULES.md with the kit's rodo/RULES.md yourself; it is never replaced.\n${C.read(mig)}`);
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
