import { describe, expect, it } from 'vitest';
process.env.RODO_CLI_NO_MAIN = '1';
const { buildProgram } = await import('../src/index');

const helpAll = (name?: string) => {
  const p = buildProgram(async () => {});
  let out = '';
  p.configureOutput({ writeOut: (s) => { out += s; }, writeErr: () => {} });
  p.exitOverride();
  try { p.parse(['node', 'rodo', ...(name ? [name] : []), '--help']); } catch { /* help exits */ }
  return out;
};

describe('help texts (dogfood #9, #10)', () => {
  it('top-level help has a getting-started list including rodo new', () => {
    const h = helpAll();
    expect(h).toContain('Getting started:');
    expect(h).toMatch(/rodo new "/);
    expect(h).toContain('error codes stay English');
  });
  it('init options are described and have examples', () => {
    const h = helpAll('init');
    for (const s of ['--server <url>  ', '--connect <code>', '--board <id>', '--create-board']) expect(h).toContain(s);
    expect(h).toMatch(/one-time connect code/);
    expect(h).toContain('Examples:');
  });
  it('validate documents --strict; new is registered', () => {
    expect(helpAll('validate')).toContain('--strict');
    expect(helpAll('new')).toContain('--major');
    expect(helpAll('new')).toContain('--slug');
  });
});
