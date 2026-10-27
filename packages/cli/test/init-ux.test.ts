import { describe, expect, it } from 'vitest';
import { chooseLanguage, nextSteps, runInit } from '../src/commands/init';
import { scriptedPrompter, withDrain, type Ctx } from '../src/core/context';
import { Out } from '../src/core/output';
import { formatProjectJson } from '../src/core/project';
import { exec, tempRepo } from './helpers/temp-repo';

describe('init UX (dogfood)', () => {
  it('#5 --dry-run never asks for the slug and writes nothing', async () => {
    const repo = tempRepo();
    let asked = 0;
    const prompt = { interactive: true, ask: async () => { asked++; return ''; }, confirm: async () => { asked++; return false; } };
    const r = await exec(repo, (ctx) => runInit(ctx, { dryRun: true, methodOnly: true }), { prompt });
    expect(r.code).toBe(0);
    expect(asked).toBe(0);
    expect(repo.exists('rodo')).toBe(false);
  });

  it('#6 the .gitignore question defaults to yes (Enter)', async () => {
    const repo = tempRepo();
    const r = await exec(repo, (ctx) => runInit(ctx, { project: 'shop', methodOnly: true }), { answers: [''], lang: 'en' });
    expect(r.stdout).toContain('.gitignore updated');
    expect(repo.read('.gitignore')).toContain('rodo/*/.rodo/');
  });

  it('#6 answering no keeps .gitignore out of the commit hint', () => {
    expect(nextSteps({ bound: false, gitignore: false })).not.toContain('.gitignore');
    expect(nextSteps({ bound: true, gitignore: true })).toContain('live on the board');
  });

  it('#8 language: --lang wins, else the locale (non-interactive), else the answer', async () => {
    const ctx = (lang: string | undefined, answers: string[], interactive: boolean) =>
      ({ cwd: '.', opts: { lang }, out: new Out({}), prompt: scriptedPrompter(answers, interactive) }) as unknown as Ctx;
    expect(await chooseLanguage(ctx('fa', [], true), { LANG: 'en_US.UTF-8' })).toBe('fa');
    expect(await chooseLanguage(ctx(undefined, [], false), { LANG: 'fa_IR.UTF-8' })).toBe('fa');
    expect(await chooseLanguage(ctx(undefined, [], false), { LANG: 'C' })).toBe('en');
    expect(await chooseLanguage(ctx(undefined, ['fa'], true), { LANG: 'C' })).toBe('fa');
    expect(await chooseLanguage(ctx(undefined, [''], true), { LANG: 'C' })).toBe('en');
  });

  it('#8 an English project gets English docs', async () => {
    const repo = tempRepo();
    await exec(repo, (ctx) => runInit(ctx, { project: 'shop', methodOnly: true, yesFiles: true }), { lang: 'en' });
    expect(JSON.parse(repo.read('rodo/shop/project.json')).language.simple).toBe('en');
    expect(repo.read('rodo/shop/MAP.md')).toContain('## Done');
    expect(repo.read('rodo/shop/MAP.md')).not.toContain('انجام‌شده');
  });

  it('P1-4 a prompt prints the collected lines first (list above "Number")', async () => {
    const written: string[] = [];
    const out = new Out({}, (s) => written.push(s));
    const order: string[] = [];
    const p = withDrain({ interactive: true, ask: async () => { order.push(`ask after ${written.length}`); return '1'; }, confirm: async () => true }, out);
    out.line('Workspaces:');
    out.line('  1) QA test');
    await p.ask('Number', '1');
    expect(written.join('')).toBe('Workspaces:\n  1) QA test\n');
    expect(order).toEqual(['ask after 1']);
  });

  it('#19 project.json keeps short arrays and objects on one line', () => {
    const s = formatProjectJson({ schemaVersion: 2, language: { simple: 'fa', technical: 'en' }, stepsDirs: ['e2e/steps'], boardId: 'b' });
    expect(s).toContain('"language": { "simple": "fa", "technical": "en" }');
    expect(s).toContain('"stepsDirs": ["e2e/steps"]');
    expect(JSON.parse(s)).toMatchObject({ boardId: 'b' });
  });
});
