// Small shared helpers for the RODO kit scripts (install, update). No dependencies. Node >= 18.
// The kit only helps install and update the method files. It never checks, blocks or enforces anything.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const exists = (p) => fs.existsSync(p);
const isDir = (p) => exists(p) && fs.statSync(p).isDirectory();
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const git = (a, cwd) => { try { return cp.execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const findRoot = (arg) => path.resolve(arg || (git(['rev-parse', '--show-toplevel'], process.cwd()) || '').trim() || process.cwd());

const DEFAULTS = {
  language: { simple: 'fa', technical: 'en' },
  stepsDirs: ['e2e/steps'],
  testCommand: 'npx bddgen --tags @cycle-{NNN} && npx playwright test --grep @cycle-{NNN}',
  kitRepo: 'https://github.com/OWNER/rodo-method.git',
  kitRef: 'main',
};
function loadConfig(root) {
  const p = path.join(root, 'rodo', 'config.json');
  const c = exists(p) ? JSON.parse(read(p)) : {};
  return { ...DEFAULTS, ...c, language: { ...DEFAULTS.language, ...(c.language || {}) } };
}

module.exports = { exists, isDir, read, git, findRoot, loadConfig };
