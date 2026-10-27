#!/usr/bin/env node
// rodo-install: adds the RODO method files to a project. Safe to run twice. Never overwrites a file.
//   node <kit>/scripts/rodo-install.cjs [--target DIR] [--no-gitignore]
// Run it from a downloaded copy of the kit (e.g. npx degit OWNER/rodo-method .rodo-kit).
// It copies the kit files, creates rodo/ only where files are missing, and appends a marked block
// to AGENTS.md and CLAUDE.md. It does not install git hooks or CI checks: RODO is a method, not a gate.
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./lib/core.cjs');
const args = process.argv.slice(2);
const ti = args.indexOf('--target');
const target = path.resolve(ti >= 0 ? args[ti + 1] : process.cwd());
const kit = path.resolve(__dirname, '..');
if (target === kit) { console.error('rodo-install: run it from the project folder or pass --target DIR (not the kit folder itself)'); process.exit(2); }
const manifest = JSON.parse(C.read(path.join(kit, 'kit-manifest.json')));
const version = C.read(path.join(kit, 'KIT_VERSION')).trim();
const log = (s) => console.log(`  ${s}`);
const copy = (from, to, rel) => {
  if (C.isDir(from)) { for (const n of fs.readdirSync(from)) copy(path.join(from, n), path.join(to, n), `${rel}/${n}`); return; }
  if (C.exists(to)) { log(`kept     ${rel}`); return; } // never overwrite
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); log(`added    ${rel}`);
};
const createIfMissing = (rel, content) => {
  const p = path.join(target, rel);
  if (C.exists(p)) { log(`kept     ${rel}`); return; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  log(`created  ${rel}`);
};

console.log(`rodo-install ${version} -> ${target}`);
for (const f of manifest.files) copy(path.join(kit, f), path.join(target, f), f.replace(/\/$/, ''));

// rodo/ skeleton (never overwritten)
const T = path.join(kit, '.agents/skills/rodo/templates');
const today = new Date().toISOString().slice(0, 10);
const tpl = (n) => C.read(path.join(T, n)).replace(/\{\{DATE\}\}/g, today);
createIfMissing('rodo/RULES.md', C.read(path.join(kit, 'rodo/RULES.md')));
createIfMissing('rodo/MAP.md', tpl('MAP.md'));
createIfMissing('rodo/MEMORY.md', tpl('MEMORY.md'));
createIfMissing('rodo/CHANGELOG.md', tpl('CHANGELOG.md'));
createIfMissing('rodo/config.json', tpl('config.json'));
for (const n of ['brief', 'architecture', 'glossary']) createIfMissing(`rodo/project/${n}.md`, tpl(`${n}.md`));
fs.mkdirSync(path.join(target, 'rodo/cycles'), { recursive: true });
fs.writeFileSync(path.join(target, 'rodo/.kit-version'), version + '\n');
log(`wrote    rodo/.kit-version (${version})`);

// AGENTS.md / CLAUDE.md: append a marked block once
const block = (n) => `<!-- rodo:start -->\n${C.read(path.join(kit, n)).trim()}\n<!-- rodo:end -->\n`;
for (const n of ['AGENTS.md', 'CLAUDE.md']) {
  const p = path.join(target, n);
  const cur = C.exists(p) ? C.read(p) : '';
  if (cur.includes('<!-- rodo:start -->')) { log(`kept     ${n} (RODO block already there)`); continue; }
  fs.writeFileSync(p, cur ? `${cur.replace(/\n*$/, '\n\n')}${block(n)}` : block(n));
  log(`${cur ? 'appended' : 'created '} ${n}`);
}

// .gitignore: cards are synced by the RODO watcher, not by git
if (args.includes('--no-gitignore')) console.log('  note: you chose not to touch .gitignore; add the lines from gitignore.sample if you do not want cards in git');
else {
  const p = path.join(target, '.gitignore'), cur = C.exists(p) ? C.read(p) : '';
  const add = C.read(path.join(kit, 'gitignore.sample')).split('\n').filter((l) => l.trim() && !l.startsWith('#') && !cur.split('\n').includes(l));
  if (add.length) { fs.writeFileSync(p, `${cur.replace(/\n*$/, cur ? '\n' : '')}# RODO\n${add.join('\n')}\n`); log(`updated  .gitignore (+${add.length})`); } else log('kept     .gitignore');
}
console.log('Done. Next: open your AI tool and say "rodo: onboard" (existing project) or "rodo: new card for ..." (new work).');
