import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffModels, failureSignature, parseCard, serializeCard, threeWay, validateCard } from '../src/index';
import { card, codes, ctx, here, model, read, validate } from './helpers';

const KIT = '../../rodo-kit/fixtures/kit-2.0.0/example/rodo/cycles/';
const kitCards = readdirSync(here(KIT)).map((d) => ({ d, text: read(`${KIT}${d}/card.rodo.md`) }));

describe('R3 kit 2.0 example cards', () => {
  for (const { d, text } of kitCards) {
    it(`${d} has no error`, () => {
      const r = validate(text, { relPath: `cycles/${d}/card.rodo.md`, siblingFiles: ['simple.md', 'spec.md'] });
      expect(r.errors).toEqual([]);
      expect(r.warnings.map((w) => w.code)).toContain('SCHEMA_V1');
    });
  }
  it('the cancelled one gets its reason from Progress notes', () => {
    const r = validate(kitCards[2].text);
    expect(r.warnings.map((w) => w.code)).toContain('STATUS_REASON_FROM_NOTES');
    expect(r.model?.statusReason).toContain('مریم فعلاً');
  });
});

describe('R2 messages', () => {
  it('STATUS_INVALID is exact and on the right line', () => {
    const r = validate('---\nschemaVersion: 2\ntitle: "T"\nstatus: doing\n---\n');
    expect(r.errors).toEqual([{
      code: 'STATUS_INVALID', line: 4,
      message: 'STATUS_INVALID: status must be todo, in_progress, blocked, cancelled or done (found "doing")',
    }]);
  });
  it('UPDATED_AT_EDITED is a warning, not an error', () => {
    const base = model(card('updatedAt: 1791350000123\n'));
    const r = validate(card('updatedAt: 1\n'), { base });
    expect(r.errors).toEqual([]);
    expect(codes(r)).toContain('UPDATED_AT_EDITED');
    expect(r.model?.updatedAt).toBe(1791350000123);
  });
});

describe('R4 round trip', () => {
  const text = card('x-note: hi\n', 'توضیح فارسی\n\n## Progress notes\n\n- Updated: 2026-10-07\n').replace(/\n/g, '\r\n');
  it('is idempotent and keeps description, x-note and CRLF', () => {
    const once = serializeCard(model(text), { original: text });
    const twice = serializeCard(model(once), { original: once });
    expect(twice).toBe(once);
    expect(once).toContain('\r\n');
    expect(once.replace(/\r\n/g, '\n')).not.toMatch(/(^|[^\r])\r(?!\n)/);
    expect(once).toContain('x-note: hi');
    expect(model(once).description).toBe(model(text).description);
  });
  for (const { d, text: t } of kitCards) {
    it(`kit card ${d} is stable`, () => {
      const once = serializeCard(model(t), { original: t });
      expect(serializeCard(model(once), { original: once })).toBe(once);
      expect(model(once)).toEqual(model(t));
    });
  }
  it('handles a BOM', () => {
    const t = '﻿' + card();
    expect(serializeCard(model(t), { original: t }).charCodeAt(0)).toBe(0xfeff);
    expect(validate(t).errors).toEqual([]);
  });
});

describe('R5 diff and merge', () => {
  const withItem = (done: boolean, title = 'A') =>
    card('', `## Checklist: قدم‌ها <!-- rodo:chk_aaaaaaaa1 -->\n\n- [${done ? 'x' : ' '}] i1 <!-- rodo:ckl_bbbbbbbb1 -->`).replace('title: "T"', `title: "${title}"`);
  it('different fields on both sides both survive', () => {
    const base = model(withItem(false, 'A'));
    const remote = model(withItem(false, 'B'));
    const local = model(withItem(true, 'A'));
    const r = threeWay(base, local, remote);
    expect(r.push.fields).toBeUndefined();
    expect(r.push.checklists?.[0].items).toEqual([{ id: 'bbbbbbbb1', set: { isDone: true } }]);
    expect(r.write.title).toBe('B');
    expect(r.write.checklists[0].items[0].isDone).toBe(true);
    expect(r.conflicts).toEqual([]);
  });
  it('same field both sides is reported as a conflict', () => {
    const base = model(card());
    const r = threeWay(base, { ...base, title: 'L' }, { ...base, title: 'R' });
    expect(r.conflicts).toEqual(['title']);
    expect(r.push.fields?.title).toBe('L');
  });
  it('members are add/remove sets', () => {
    const base = model(card('members: [sara, ali]\n'));
    const d = diffModels(base, { ...base, members: ['sara', 'bob'] });
    expect(d.members).toEqual({ add: ['bob'], remove: ['ali'] });
  });
  it('the AI cannot tick the approval step', () => {
    const t = (x: string) => card('', `## Checklist: c <!-- rodo:chk_aaaaaaaa1 -->\n\n- [${x}] تأیید [approval] <!-- rodo:ckl_bbbbbbbb1 -->`);
    const base = model(t(' '));
    const r = validate(t('x'), { base });
    expect(r.errors.map((e) => e.code)).toEqual(['APPROVAL_REQUIRES_HUMAN']);
    expect(diffModels(base, r.model!).checklists).toBeUndefined();
  });
  it('an Answer line written locally is an error and no op', () => {
    const d = (a: string) => card('', `## Decision: q? <!-- rodo:dec_cccccccc1 -->\n\n- A: yes\n- B: no${a}`);
    const base = model(d(''));
    const r = validate(d('\n- Answer: A'), { base });
    expect(r.errors.map((e) => e.code)).toEqual(['DECISION_ANSWER_REQUIRES_HUMAN']);
    expect(diffModels(base, r.model!).decisions).toBeUndefined();
    expect(validate(d('\n- Answer: A')).errors.map((e) => e.code)).toEqual(['DECISION_ANSWER_REQUIRES_HUMAN']);
  });
  it('an open decision removed locally is withdrawn, an answered one is kept', () => {
    const base = model(card('', '## Decision: q? <!-- rodo:dec_cccccccc1 -->\n\n- A: yes\n- B: no'));
    expect(diffModels(base, { ...base, decisions: [] }).decisions).toEqual([{ id: 'cccccccc1', withdraw: true }]);
    const answered = { ...base, decisions: [{ ...base.decisions[0], answer: { key: 'A', note: null } }] };
    expect(diffModels(answered, { ...answered, decisions: [] }).decisions).toBeUndefined();
  });
  it('an item deleted on the server and edited locally: server wins', () => {
    const base = model(withItem(false));
    const local = model(withItem(true));
    const remote = { ...base, checklists: [{ ...base.checklists[0], items: [] }] };
    expect(threeWay(base, local, remote).write.checklists[0].items).toEqual([]);
  });
});

describe('R6 statusReason', () => {
  const blocked = card('', '').replace('status: todo', 'status: blocked').replace('---\n', '---\n').replace('schemaVersion: 2', 'schemaVersion: 1\nboardId: b1');
  const text = blocked.replace(/\n$/, '') + '\n\n## Progress notes\n\n- Blocker: waiting for the payment key\n';
  it('legacy blocked card keeps working and gets the key after status', () => {
    const r = validate(text);
    expect(r.errors).toEqual([]);
    expect(codes(r)).toContain('STATUS_REASON_FROM_NOTES');
    expect(r.model?.statusReason).toBe('waiting for the payment key');
    const out = serializeCard(r.model!, { original: text });
    expect(out).toMatch(/status: blocked\nstatusReason: waiting for the payment key\n/);
    expect(model(out).description).toBe(r.model!.description);
  });
  it('statusReason without a hold status is a warning and not in the status group', () => {
    const r = validate(card('statusReason: because\n'));
    expect(r.errors).toEqual([]);
    expect(codes(r)).toContain('STATUS_REASON_WITHOUT_HOLD');
    const base = model(card());
    expect(diffModels(base, r.model!).fields).toBeUndefined();
  });
});

describe('R7 secrets', () => {
  const tok = 'ghp_' + 'a'.repeat(36);
  it('a token in the description is refused without leaking it', () => {
    const r = validate(card('', `key ${tok}`));
    const e = r.errors.find((x) => x.code === 'SECRET_SUSPECTED')!;
    expect(e.message).toContain('github-token');
    expect(e.message).not.toContain(tok);
  });
  it('a token written as a code example is allowed', () => {
    const r = validate(card('', `use \`token = ${tok}\` in the docs`));
    expect(codes(r)).not.toContain('SECRET_SUSPECTED');
    expect(codes(r)).toContain('SECRET_POSSIBLE');
  });
  it('a bare token inside code stays an error', () => {
    expect(codes(validate(card('', `\`${tok}\``)))).toContain('SECRET_SUSPECTED');
  });
  it('an assignment in plain text is an error', () => {
    expect(codes(validate(card('', 'password = hunter2hunter2')))).toContain('SECRET_SUSPECTED');
  });
});

describe('R8 failure signature', () => {
  it('same failure with other timestamp and port is equal', () => {
    const a = failureSignature({ adapter: 'web', scenario: '@R2', step: 'expect', errorType: 'Assertion', message: 'GET localhost:3001 at 2026-10-07T08:00:01Z failed' });
    const b = failureSignature({ adapter: 'web', scenario: '@R2', step: 'expect', errorType: 'Assertion', message: 'GET localhost:4123 at 2026-10-08T11:22:33Z failed' });
    expect(a).toEqual(b);
    expect(a.short).toHaveLength(12);
    expect(a.full).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it('different failures differ', () => {
    const f = (message: string) => failureSignature({ adapter: 'api', scenario: 's', step: 'x', errorType: 'E', message }).short;
    expect(f('expected 409, got 200')).not.toBe(f('expected 404, got 200'));
  });
});

describe('R10 workflow', () => {
  it('a wrong value is only a warning and not a diff', () => {
    const r = validate(card('workflow: fast\n'));
    expect(r.errors).toEqual([]);
    expect(codes(r)).toContain('WORKFLOW_INVALID');
    const base = model(card());
    expect(diffModels(base, r.model!)).toEqual({});
  });
  it('a workflow-only change produces no push and is kept in write', () => {
    const base = model(card());
    const local = { ...base, workflow: 'major' as const };
    const r = threeWay(base, local, base);
    expect(r.push).toEqual({});
    expect(r.write.workflow).toBe('major');
  });
  it('major without design.md warns on a cycle card', () => {
    const t = card('workflow: major\n');
    const w = (sib: string[]) => codes(validate(t, { relPath: 'cycles/004-x/card.rodo.md', siblingFiles: sib }));
    expect(w(['simple.md'])).toContain('DESIGN_MISSING');
    expect(w(['simple.md', 'design.md'])).not.toContain('DESIGN_MISSING');
    expect(codes(validate(card('workflow: standard\n'), { relPath: 'cycles/004-x/card.rodo.md' }))).not.toContain('DESIGN_MISSING');
  });
});

describe('structure', () => {
  it('reports frontmatter problems', () => {
    expect(validate('hello').errors.map((e) => e.code)).toEqual(['FRONTMATTER_MISSING']);
    expect(validate('---\ntitle: x\n').errors.map((e) => e.code)).toEqual(['FRONTMATTER_UNCLOSED']);
    expect(validate('---\ntitle: [\n---\n').errors[0].code).toBe('YAML_INVALID');
    expect(validate('---\ntitle: a\ntitle: b\n---\n').errors[0].code).toBe('YAML_INVALID');
  });
  it('counts a RODO_ERROR line in line numbers and ignores it', () => {
    const r = validate('<!-- RODO_ERROR: x -->\n---\nschemaVersion: 2\ntitle: "T"\nstatus: doing\n---\n');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(5);
  });
  it('has correct YAML line numbers with BOM and CRLF', () => {
    const r = validate('﻿---\r\nschemaVersion: 2\r\ntitle: "T"\r\nstatus: doing\r\n---\r\n');
    expect(r.errors[0].line).toBe(4);
  });
  it('Persian text: ZWNJ, Arabic ي/ك survive a round trip', () => {
    const t = card('', 'می‌خواهم كتاب بخوانم، ي ك');
    expect(model(serializeCard(model(t))).description).toBe('می‌خواهم كتاب بخوانم، ي ك');
  });
  it('parseCard exposes errors and warnings', () => {
    const r = parseCard(card('priority: huge\n'));
    expect(r.errors.map((e) => e.code)).toEqual(['PRIORITY_INVALID']);
  });
  it('ctx helper compiles with every field', () => expect(ctx().relPath).toBe('inbox/x.rodo.md'));
  it('validateCard is exported', () => expect(typeof validateCard).toBe('function'));
});

import { keepProgressNotes, progressSection } from '../src/progress-notes';
describe('keepProgressNotes (dogfood P1-1)', () => {
  it('extracts the section up to the next heading', () => {
    expect(progressSection('a\n\n## Progress notes\n\n- Done: x\n\n## Other\ny')).toBe('## Progress notes\n\n- Done: x');
    expect(progressSection('no notes')).toBeNull();
  });
  it('appends local notes only when the incoming text has none', () => {
    expect(keepProgressNotes('new', 'old\n\n## Progress notes\n\n- Done: x')).toBe('new\n\n## Progress notes\n\n- Done: x');
    expect(keepProgressNotes('new\n\n## Progress notes\n\n- Done: y', 'old\n\n## Progress notes\n\n- Done: x')).toContain('Done: y');
    expect(keepProgressNotes('new', 'old')).toBe('new');
    expect(keepProgressNotes('', '## Progress notes\n- a')).toBe('## Progress notes\n- a');
  });
});

import { listedInMap, MAP_HEADINGS } from '../src/hints';
describe('listedInMap (dogfood P1-3)', () => {
  const c = MAP_HEADINGS.cancelled;
  it('accepts relative and absolute links and English headings', () => {
    expect(listedInMap('## لغوشده\n\n- [002](cycles/002-export/simple.md) — no', '002-export', c)).toBe(true);
    expect(listedInMap('## لغوشده\n\n- [002](/rodo/p/cycles/002-export/simple.md) — no', '002-export', c)).toBe(true);
    expect(listedInMap('## Cancelled\n\n- cycles/002-export — no', '002-export', c)).toBe(true);
    expect(listedInMap('## لغوشده (cancelled)\n- (cycles/002-export/)', '002-export', c)).toBe(true);
  });
  it('rejects other sections and prefix folders', () => {
    expect(listedInMap('## بعدی\n- (cycles/002-export/simple.md)', '002-export', c)).toBe(false);
    expect(listedInMap('## لغوشده\n- (cycles/002-export-v2/simple.md)', '002-export', c)).toBe(false);
  });
  it('done cycles need a Done/انجام‌شده line', () => {
    expect(listedInMap('## Done\n- [1](cycles/001-a/simple.md)', '001-a', MAP_HEADINGS.done)).toBe(true);
  });
});
