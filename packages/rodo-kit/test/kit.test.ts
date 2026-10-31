import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCard } from '@rodo/card-format';
import { describe, expect, it } from 'vitest';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_DIR = '.agents/skills/rodo';
const read = (rel: string) => readFileSync(join(KIT, rel), 'utf8').replaceAll('\r\n', '\n');
const walk = (d: string): string[] =>
  readdirSync(join(KIT, d)).flatMap((n) => (statSync(join(KIT, d, n)).isDirectory() ? walk(`${d}/${n}`) : [`${d}/${n}`]));
const skill = () => read(`${SKILL_DIR}/SKILL.md`);
const planner = () => read(`${SKILL_DIR}/planner.md`);
const headings = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());

const MAJOR_QUESTIONS = [
  'Does it add or change architecture',
  'coordinated design across several areas',
  'public API or contract',
  'security, authentication, money, or deleting data',
  'expensive to undo',
  'two or more reasonable technical approaches',
];

function check(text: string, over: { siblingFiles?: string[] } = {}) {
  return validateCard(text, {
    relPath: 'cycles/001-x/card.rodo.md',
    projectSlug: 'shop',
    boundBoardId: null,
    base: null,
    meta: null,
    repoFileExists: () => true,
    siblingFiles: over.siblingFiles ?? ['card.rodo.md', 'simple.md', 'spec.md', 'design.md'],
    mapText: null,
  });
}

describe('kit manifest', () => {
  it('lists every kit file with the right version and no 2.0 install scripts', () => {
    const m = JSON.parse(read('kit-manifest.json'));
    expect(m.version).toBe(read('KIT_VERSION').trim());
    expect(m.version).toBe('2.3.0');
    expect(m.files.map((f: { src: string }) => f.src).sort()).toEqual(walk('.agents').sort());
    expect(m.projectTemplate.map((f: { src: string }) => f.src).sort()).toEqual(walk('project-template').sort());
    // fixtures/kit-2.0.0 keeps the old 2.0 scripts on purpose (legacy-hash and migration tests); it is never bundled
    expect(walk('.').filter((f) => !f.startsWith('./fixtures/') && /rodo-(install|update)\.cjs$/.test(f))).toEqual([]);
  });

  it('R3 installs no hooks, CI files or blocking scripts', () => {
    const all = [...walk('.agents'), ...walk('project-template'), 'agents-block.md'];
    expect(all.filter((f) => /hook|\.github|\.githooks|workflow\.yml|settings\.json/i.test(f))).toEqual([]);
  });

  it('R5 never hard-codes rodo/cycles or the 2.0 config paths', () => {
    const files = [...walk('.agents'), ...walk('project-template'), 'agents-block.md'];
    for (const f of files) {
      const t = read(f);
      expect(t, f).not.toMatch(/rodo\/cycles/);
      expect(t, f).not.toMatch(/rodo\/(MAP|MEMORY|CHANGELOG|RULES)\.md/);
      expect(t, f).not.toContain('rodo/config.json');
    }
  });
});

describe('templates (R2, tests 1-2)', () => {
  const T = `${SKILL_DIR}/templates`;

  it('the card and request templates validate with no errors', () => {
    for (const f of ['card.rodo.md', 'request.rodo.md']) {
      const v = check(read(`${T}/${f}`));
      expect(v.errors, f).toEqual([]);
    }
  });

  it('design.md has exactly the nine headings', () => {
    expect(headings(read(`${T}/design.md`))).toEqual([
      'Problem', 'Proposed approach', 'Architecture impact', 'Components affected', 'Data / API impact',
      'Trade-offs', 'Risks', 'Alternatives considered', 'Decisions',
    ]);
  });

  it('spec.md has the v2.1 sections before Decisions', () => {
    const h = headings(read(`${T}/spec.md`));
    for (const s of ['Acceptance criteria', 'Documentation Impact', 'Open Questions', 'Decisions']) expect(h).toContain(s);
    expect(h.indexOf('Decisions')).toBeGreaterThan(h.indexOf('Open Questions'));
  });

  it('R19 no template tells the AI to write "- Blocker:"', () => {
    for (const f of walk('.agents')) expect(read(f), f).not.toContain('- Blocker:');
  });
});

describe('workflow key (tests 3-4, R16)', () => {
  const card = (extra: string) => read(`${SKILL_DIR}/templates/card.rodo.md`).replace('priority: medium\n', `priority: medium\n${extra}`);

  it('accepts quick|standard|major and a missing workflow without a warning', () => {
    for (const w of ['quick', 'standard', 'major', '']) {
      const v = check(w ? card(`workflow: ${w}\n`) : card(''));
      expect(v.errors).toEqual([]);
      expect(v.warnings.map((x) => x.code)).not.toContain('WORKFLOW_INVALID');
    }
  });

  it('warns WORKFLOW_INVALID for any other value but the card stays valid', () => {
    const v = check(card('workflow: fast\n'));
    expect(v.errors).toEqual([]);
    expect(v.warnings.map((x) => x.code)).toContain('WORKFLOW_INVALID');
  });

  it('warns DESIGN_MISSING only for a major cycle card without design.md', () => {
    const major = card('workflow: major\n');
    const without = ['card.rodo.md', 'simple.md', 'spec.md'];
    expect(check(major, { siblingFiles: without }).warnings.map((x) => x.code)).toContain('DESIGN_MISSING');
    expect(check(major).warnings.map((x) => x.code)).not.toContain('DESIGN_MISSING');
    expect(check(card('workflow: standard\n'), { siblingFiles: without }).warnings.map((x) => x.code)).not.toContain('DESIGN_MISSING');
  });
});

describe('SKILL.md text (R1, R6, R8-R11, R17-R19)', () => {
  it('has the ask rule, the clarification text and the document kinds', () => {
    const s = skill();
    expect(s).toContain('The goal is less rework, not more conversation');
    expect(s).toContain('Do not turn ordinary clarification questions into');
    for (const k of ['CURRENT', 'ACTIVE CYCLE', 'HISTORICAL']) expect(s).toContain(k);
    expect(s).toMatch(/if available[^\n]*Graphify/);
  });

  it('forbids git pull/fetch/merge/rebase and tells the user once when behind', () => {
    const s = skill();
    expect(s).toContain('Do **not** run `git pull`, `git fetch`, `git merge` or `git rebase`');
    expect(s).toContain('tell the user once');
  });

  it('keeps approvals, decisions, boards and archive confirmation with people', () => {
    const s = skill();
    expect(s).toContain('`- Answer:` lines under a decision');
    expect(s).toContain('unticked `[approval]` step');
    expect(s).toContain('**Never create a board yourself**');
    expect(s).toContain('Never add `--confirm-archive` yourself');
    expect(s).not.toContain('- Blocker:');
  });

  it('R18 stays short and leaves the details to the playbooks', () => {
    const s = skill();
    expect(s.split('\n').length).toBeLessThan(200);
    for (const q of MAJOR_QUESTIONS) {
      expect(s).not.toContain(q);
      expect(planner()).toContain(q);
    }
    expect(s).not.toContain('build, typecheck, lint');
    expect(read(`${SKILL_DIR}/coder.md`)).toContain('build, typecheck, lint');
  });
});

describe('playbooks and RULES.md (tests 7-8, R12-R15)', () => {
  it('planner.md has Clarify (max 5), Documentation Impact and the documents table; step "at most 3" is gone', () => {
    const p = planner();
    for (const h of ['Classify', 'Clarify (before planning)', 'Documentation Impact (after understand, before classify)', 'Documents per level']) expect(p).toContain(`## ${h}`);
    expect(p).toContain('at most 5 questions per round');
    expect(p).not.toContain('at most 3 short questions');
  });

  it('small-change.md is the QUICK level with a docs glance', () => {
    const t = read(`${SKILL_DIR}/small-change.md`);
    expect(t).toContain('This is the QUICK level');
    expect(t).toContain('Docs glance (one line)');
  });

  it('coder.md verifies with documentation consistency and uses the existing stuck rule', () => {
    const t = read(`${SKILL_DIR}/coder.md`);
    expect(t).toContain('Documentation Consistency');
    expect(t).toContain('the **same failure twice**');
  });

  it('RULES.md has the three new Persian sections and the other session sections', () => {
    const h = headings(read('project-template/RULES.md'));
    for (const s of ['سه اندازهٔ کار', 'فقط سؤال‌های مهم', 'سندها همیشه با کد یکی‌اند', 'شروع و پایان هر جلسهٔ AI', 'گیر کردن', 'نیاز به تصمیم', 'محدوده']) expect(h).toContain(s);
  });

  it('the agents block is the short ref/14 §9 text', () => {
    const b = read('agents-block.md');
    expect(b).toContain('kit 2.3.0');
    expect(b).toContain('Never run `git pull`, `git fetch`, `git merge` or `git rebase`');
  });
});

describe('plain project docs (kit 2.3)', () => {
  it('both languages have the templates with the same structure, and the writing rules are kit-owned', () => {
    for (const d of ['project-template', 'project-template-en']) {
      for (const f of ['project-overview.md', 'how-it-works.md']) expect(read(`${d}/project/${f}`)).toContain('project-docs.md');
      expect(read(`${d}/project/project-overview.md`)).toContain('- [ ] **');
    }
    const m = JSON.parse(read('kit-manifest.json'));
    expect(m.files.map((f: { dest: string }) => f.dest)).toContain(`${SKILL_DIR}/project-docs.md`);
  });

  it('the playbooks send the planner, the coder and onboarding to the rules', () => {
    for (const f of ['SKILL.md', 'planner.md', 'coder.md', 'onboarding.md']) expect(read(`${SKILL_DIR}/${f}`), f).toContain('project-docs.md');
    expect(planner()).toContain('update them before BUILD');
  });
});

describe('manifest hashes are stable', () => {
  it('the manifest does not embed content hashes of the current kit files', () => {
    const m = read('kit-manifest.json');
    const h = createHash('sha256').update(skill()).digest('hex');
    expect(m).not.toContain(h);
    expect(existsSync(join(KIT, 'MIGRATION.md'))).toBe(true);
    expect(read('MIGRATION.md')).toContain('2.0.0 → 2.1.0');
  });
});

describe('English templates (kit 2.2, dogfood #8)', () => {
  it('the manifest lists every project-template-en file', () => {
    const m = JSON.parse(read('kit-manifest.json'));
    expect(m.projectTemplateEn.map((f: { src: string }) => f.src).sort()).toEqual(walk('project-template-en').sort());
    expect(m.projectTemplateEn.map((f: { dest: string }) => f.dest).sort()).toEqual(m.projectTemplate.map((f: { dest: string }) => f.dest).sort());
  });
  it('English project files carry no Persian text and use English MAP headings', () => {
    for (const f of walk('project-template-en')) expect(read(f), f).not.toMatch(/[\u0600-\u06FF]/);
    expect(headings(read('project-template-en/MAP.md'))).toEqual(['What this project is', 'Where we are', 'Done', 'Cancelled', 'Next']);
    expect(JSON.parse(read('project-template-en/project.json')).language.simple).toBe('en');
  });
  it('the English card and request templates validate with no errors and have no Persian', () => {
    for (const f of ['card.rodo.md', 'request.rodo.md']) {
      const t = read(`${SKILL_DIR}/templates/en/${f}`);
      expect(check(t).errors, f).toEqual([]);
      expect(t).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
  it('card templates do not put the cycle number in the title (dogfood #9)', () => {
    for (const f of ['card.rodo.md', 'en/card.rodo.md']) expect(read(`${SKILL_DIR}/templates/${f}`)).not.toMatch(/^title: "\{\{NNN\}\}/m);
  });
});
