import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init';
import { nextNumber, runNew, slugify } from '../src/commands/new';
import { runValidate } from '../src/commands/validate';
import { addCycle, cardText, exec, initProject, tempRepo } from './helpers/temp-repo';

describe('rodo new (dogfood suggestion 1)', () => {
  it('slugify and next number', () => {
    expect(slugify('Delete a note!')).toBe('delete-a-note');
    expect(slugify('حذف یادداشت')).toBe('');
    const repo = tempRepo();
    expect(nextNumber(join(repo.root, 'nope'))).toBe('001');
    repo.write('c/002-a/x', ''); repo.write('c/010-b/x', '');
    expect(nextNumber(join(repo.root, 'c'))).toBe('011');
  });

  it('English project: next number, English templates, filled placeholders, valid card', async () => {
    const repo = tempRepo();
    await exec(repo, (ctx) => runInit(ctx, { project: 'notely', methodOnly: true, yesFiles: true }), { lang: 'en' });
    addCycle(repo, 'notely', '001-add', cardText({ slug: 'notely', folder: '001-add' }));
    const r = await exec(repo, (ctx) => runNew(ctx, 'Delete a note', {}), { json: true });
    expect(r.code).toBe(0);
    expect(r.json().folder).toBe('rodo/notely/cycles/002-delete-a-note');
    const base = join(repo.root, 'rodo/notely/cycles/002-delete-a-note');
    const card = readFileSync(join(base, 'card.rodo.md'), 'utf8');
    expect(card).toContain('title: "Delete a note"');
    expect(card).toContain('/rodo/notely/cycles/002-delete-a-note/simple.md');
    expect(card).toContain('Plain explanation');
    expect(readFileSync(join(base, 'simple.md'), 'utf8')).toMatch(/^# 002 — Delete a note/);
    expect(existsSync(join(base, 'spec.md'))).toBe(true);
    expect(existsSync(join(base, 'design.md'))).toBe(false);
    expect(r.json().errors).toBe(0);
  });

  it('--major adds design + acceptance and sets workflow; Persian title needs --slug', async () => {
    const repo = tempRepo();
    await initProject(repo);
    await expect(exec(repo, (ctx) => runNew(ctx, 'لغو سفارش', {}))).rejects.toThrow(/--slug/);
    const r = await exec(repo, (ctx) => runNew(ctx, 'لغو سفارش', { slug: 'order-cancel', major: true }), { json: true });
    const base = join(repo.root, 'rodo/shop/cycles/001-order-cancel');
    const card = readFileSync(join(base, 'card.rodo.md'), 'utf8');
    expect(card).toContain('title: "لغو سفارش"');
    expect(card).toMatch(/^workflow: major$/m);
    expect(card).toContain('- [سناریوهای پذیرش](/rodo/shop/cycles/001-order-cancel/acceptance.feature)');
    expect(readFileSync(join(base, 'acceptance.feature'), 'utf8')).toContain('@cycle-001');
    expect(existsSync(join(base, 'design.md'))).toBe(true);
    expect(r.json().errors).toBe(0);
  });

  it('--dry-run writes nothing', async () => {
    const repo = tempRepo();
    await initProject(repo);
    await exec(repo, (ctx) => runNew(ctx, 'Order cancel', { dryRun: true }));
    expect(existsSync(join(repo.root, 'rodo/shop/cycles/001-order-cancel'))).toBe(false);
  });
});

describe('validate --strict (dogfood #11)', () => {
  it('exit 0 by default, 1 with --strict when there are errors', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-order-cancel', cardText({ status: 'nonsense' }));
    expect((await exec(repo, (ctx) => runValidate(ctx, []))).code).toBe(0);
    expect((await exec(repo, (ctx) => runValidate(ctx, [], { strict: true }))).code).toBe(1);
  });
  it('--strict is 0 when clean', async () => {
    const repo = tempRepo();
    await initProject(repo);
    addCycle(repo, 'shop', '004-order-cancel', cardText());
    expect((await exec(repo, (ctx) => runValidate(ctx, [], { strict: true }))).code).toBe(0);
  });
});
