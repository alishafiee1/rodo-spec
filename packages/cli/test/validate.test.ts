import { describe, expect, it } from 'vitest';
import { cardKey, findCard } from '../src/core/cards';
import { posix } from '../src/core/fs-atomic';
import { runValidate } from '../src/commands/validate';
import { addCycle, cardText, exec, initProject, snapshotTree, tempRepo } from './helpers/temp-repo';

async function project() {
  const repo = tempRepo();
  await initProject(repo);
  return repo;
}

describe('rodo validate (R4)', () => {
  it('reports a valid card with no errors', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-order-cancel', cardText());
    const r = await exec(repo, (ctx) => runValidate(ctx, []), { json: true });
    expect(r.code).toBe(0);
    expect(r.json().summary.errors).toBe(0);
    expect(r.json().version).toBe(2);
  });

  it('warns PROJECT_DOC_TOO_LONG past the word limit, ignores comments, and never fails --strict', async () => {
    const repo = await project();
    expect((await exec(repo, (ctx) => runValidate(ctx, []))).stdout).not.toContain('PROJECT_DOC_TOO_LONG');
    repo.write('rodo/shop/project/project-overview.md', `<!-- ${'x '.repeat(600)}-->\n${'word '.repeat(500)}\n`);
    expect((await exec(repo, (ctx) => runValidate(ctx, []))).stdout).not.toContain('PROJECT_DOC_TOO_LONG');
    repo.write('rodo/shop/project/project-overview.md', 'word '.repeat(501));
    const r = await exec(repo, (ctx) => runValidate(ctx, [], { strict: true }), { json: true });
    expect(r.code).toBe(0);
    expect(r.json().summary.warnings).toBe(1);
    expect(r.json().files[0]).toMatchObject({ path: 'project/project-overview.md', warnings: [{ code: 'PROJECT_DOC_TOO_LONG' }] });
  });
  it('reports STATUS_INVALID with the same message as the validator, and exits 0', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-gift-wrap', cardText({ status: 'doing' }));
    const r = await exec(repo, (ctx) => runValidate(ctx, []));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('cycles/003-gift-wrap/card.rodo.md:4');
    expect(r.stdout).toContain('STATUS_INVALID: status must be todo, in_progress, blocked, cancelled or done (found "doing")');
  });

  it('writes nothing, not even the RODO_ERROR line', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-gift-wrap', cardText({ status: 'doing' }));
    const before = snapshotTree(repo.root);
    await exec(repo, (ctx) => runValidate(ctx, []));
    expect(snapshotTree(repo.root)).toEqual(before);
  });

  it('can be limited to paths', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '003-gift-wrap', cardText({ status: 'doing', folder: '003-gift-wrap' }));
    addCycle(repo, 'shop', '004-order-cancel', cardText());
    const r = await exec(repo, (ctx) => runValidate(ctx, ['rodo/shop/cycles/004-order-cancel']), { json: true });
    expect(r.json().files.map((f: { path: string }) => f.path)).toEqual(['cycles/004-order-cancel/card.rodo.md']);
  });

  it('finds the same card id in two files', async () => {
    const repo = await project();
    const withId = (t: string) => t.replace('title:', 'id: clx9n4c5d0002gm01discnt2\ntitle:');
    addCycle(repo, 'shop', '004-a', withId(cardText({ folder: '004-a' })));
    addCycle(repo, 'shop', '005-b', withId(cardText({ folder: '005-b' })));
    const r = await exec(repo, (ctx) => runValidate(ctx, []), { json: true });
    const dup = r.json().files.flatMap((f: { path: string; errors: { code: string }[] }) => f.errors.map((e) => `${f.path}:${e.code}`));
    expect(dup.filter((x: string) => x.endsWith('CARD_ID_DUPLICATE'))).toEqual(['cycles/005-b/card.rodo.md:CARD_ID_DUPLICATE']);
  });

  it('flags a secret by kind and line, never by value', async () => {
    const repo = await project();
    addCycle(repo, 'shop', '004-order-cancel', cardText({ body: 'Use key AKIAABCDEFGHIJKLMNOP now\n\n## Progress notes\n\n- Done: x' }));
    const r = await exec(repo, (ctx) => runValidate(ctx, []));
    expect(r.stdout).toContain('SECRET_SUSPECTED');
    expect(r.stdout).not.toContain('AKIAABCDEFGHIJKLMNOP');
  });

  it('validates the legacy layout as one project and prints LEGACY_LAYOUT', async () => {
    const { legacyRepo } = await import('./helpers/temp-repo');
    const repo = legacyRepo();
    const r = await exec(repo, (ctx) => runValidate(ctx, []));
    expect(r.stdout).toContain('LEGACY_LAYOUT');
    expect(r.stdout).toContain('1 files');
  });

  it('exits 3 when no RODO project exists', async () => {
    await expect(exec(tempRepo(), (ctx) => runValidate(ctx, []))).rejects.toMatchObject({ exitCode: 3 });
  });
});

describe('paths and card lookup', () => {
  it('posix() turns Windows separators into forward slashes', () => {
    expect(posix('cycles\\004-x\\card.rodo.md')).toBe('cycles/004-x/card.rodo.md');
    expect(posix('a/b')).toBe('a/b');
  });

  it('cardKey reads the cycle folder and number', () => {
    expect(cardKey('cycles/004-order-cancel/card.rodo.md')).toEqual({ key: '004-order-cancel', number: '004' });
    expect(cardKey('inbox/new-idea-1a2b.rodo.md')).toEqual({ key: 'new-idea-1a2b', number: null });
  });

  it('findCard accepts number, folder, id and the last 8 characters of the id', () => {
    const c = { number: '004', key: '004-x', model: { id: 'clx9n4c5d0002gm01discnt2' } } as never;
    for (const q of ['004', '4', '004-x', 'clx9n4c5d0002gm01discnt2', 'm01discnt2'.slice(-8)]) expect(findCard([c], q)).toBe(c);
    expect(findCard([c], '005')).toBeNull();
  });
});
