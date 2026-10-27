import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { credentialsPath } from '../src/auth/credentials-file';
import { deleteToken, getToken, saveToken } from '../src/auth/token-store';
import { ApiError } from '../src/net/errors';
import { Http } from '../src/net/http';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'rodo-ts-'));
  process.env.RODO_HOME = home;
  delete process.env.RODO_TOKEN;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env.RODO_HOME = process.env.RODO_TEST_HOME;
  delete process.env.RODO_TOKEN;
  rmSync(home, { recursive: true, force: true });
});

describe('token store (R9)', () => {
  it('saves per server, finds it again, and deletes it', () => {
    saveToken('https://a.example/', { token: 'rodo_dev_AAA', deviceId: 'd1', expiresAt: '2027-01-01' });
    saveToken('https://b.example', { token: 'rodo_dev_BBB', deviceId: 'd2', expiresAt: '2027-01-01' });
    expect(getToken('https://a.example')!.token).toBe('rodo_dev_AAA');
    expect(getToken('https://b.example/')!.token).toBe('rodo_dev_BBB');
    deleteToken('https://a.example');
    expect(getToken('https://a.example')).toBeNull();
    expect(getToken('https://b.example')!.token).toBe('rodo_dev_BBB');
  });

  it('RODO_TOKEN wins and is never written to disk', () => {
    saveToken('https://a.example', { token: 'rodo_dev_FILE', deviceId: 'd1', expiresAt: '' });
    process.env.RODO_TOKEN = 'rodo_dev_ENV';
    expect(getToken('https://a.example')!.token).toBe('rodo_dev_ENV');
    expect(readFileSync(credentialsPath(), 'utf8')).not.toContain('rodo_dev_ENV');
  });

  it('the file is private on POSIX systems', () => {
    saveToken('https://a.example', { token: 'rodo_dev_AAA', deviceId: 'd1', expiresAt: '' });
    if (process.platform !== 'win32') expect(statSync(credentialsPath()).mode & 0o077).toBe(0);
    expect(readFileSync(credentialsPath(), 'utf8')).toContain('https://a.example');
  });

  it('an unreadable credentials file means "no token", not a crash', () => {
    saveToken('https://a.example', { token: 't', deviceId: 'd', expiresAt: '' });
    require('node:fs').writeFileSync(credentialsPath(), '{not json');
    expect(getToken('https://a.example')).toBeNull();
  });
});

describe('http client', () => {
  const sleep = async () => {};
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('sends the token only in the Authorization header, plus the CLI version and fingerprint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { ok: true }));
    await new Http({ baseUrl: 'http://x.test', token: 'rodo_dev_SECRET', cliVersion: '2.1.0', fingerprint: 'sha256:ab', sleep }).get('/v1/sync/time', { a: 1 });
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe('http://x.test/v1/sync/time?a=1');
    expect(String(url)).not.toContain('SECRET');
    expect((init!.headers as Record<string, string>)).toMatchObject({ Authorization: 'Bearer rodo_dev_SECRET', 'X-Rodo-Cli-Version': '2.1.0', 'X-Rodo-Repo-Fingerprint': 'sha256:ab' });
  });

  it('retries 5xx up to 3 attempts and then reports the last answer', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => reply(503, { code: 'DOWN', message: 'later' }));
    await expect(new Http({ baseUrl: 'http://x.test', sleep }).get('/p')).rejects.toMatchObject({ status: 503, code: 'DOWN' });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('a 5xx that recovers on the second try returns the data', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(502, {})).mockResolvedValueOnce(reply(200, { v: 1 }));
    expect(await new Http({ baseUrl: 'http://x.test', sleep }).get('/p')).toEqual({ v: 1 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never retries a 4xx', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => reply(409, { code: 'REPOSITORY_MISMATCH', message: 'no', expected: 'sha256:a' }));
    const e = await new Http({ baseUrl: 'http://x.test', sleep }).post('/p', {}).catch((x) => x as ApiError);
    expect(e).toMatchObject({ status: 409, code: 'REPOSITORY_MISMATCH', body: { expected: 'sha256:a' } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a network error is "offline" after 3 attempts', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const e = await new Http({ baseUrl: 'http://x.test', sleep }).get('/p').catch((x) => x as ApiError);
    expect(e).toMatchObject({ status: 0, code: 'OFFLINE' });
    expect((e as ApiError).offline).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('keeps the base path of the API URL', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, {}));
    await new Http({ baseUrl: 'http://x.test/api', sleep }).get('/v1/a');
    expect(String(spy.mock.calls[0]![0])).toBe('http://x.test/api/v1/a');
  });
});
