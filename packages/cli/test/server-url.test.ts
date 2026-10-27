import { afterEach, describe, expect, it } from 'vitest';
import { BUILTIN_SERVER, defaultServer } from '../src/commands/server';
import { resolveServer } from '../src/commands/auth';
import type { Ctx } from '../src/core/context';

const ctx = { cwd: '/nonexistent-rodo-dir' } as unknown as Ctx;

describe('server URL', () => {
  afterEach(() => { delete process.env.RODO_SERVER; });
  it('defaults to the built-in address', () => {
    expect(defaultServer({})).toBe(BUILTIN_SERVER);
  });
  it('RODO_SERVER overrides the default and drops trailing slashes', () => {
    expect(defaultServer({ RODO_SERVER: ' https://boards.example.com// ' })).toBe('https://boards.example.com');
  });
  it('resolveServer: flag > RODO_SERVER > default', () => {
    process.env.RODO_SERVER = 'https://env.example.com';
    expect(resolveServer(ctx, 'https://flag.example.com/')).toBe('https://flag.example.com');
    expect(resolveServer(ctx)).toBe('https://env.example.com');
    delete process.env.RODO_SERVER;
    expect(resolveServer(ctx)).toBe(BUILTIN_SERVER);
  });
});
