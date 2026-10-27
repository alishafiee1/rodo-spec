import { hostname } from 'node:os';
import type { ConnectResponse, DeviceAuthorizeResponse, DeviceTokenResponse } from '@rodo/protocol';
import { CliError } from '../core/errors';
import { discover } from '../net/discovery';
import { ApiError, toCliError } from '../net/errors';
import { Http } from '../net/http';
import { saveToken, deleteToken, getToken } from './token-store';

export const platformName = (): 'WINDOWS' | 'MACOS' | 'LINUX' =>
  process.platform === 'win32' ? 'WINDOWS' : process.platform === 'darwin' ? 'MACOS' : 'LINUX';

export interface LoginIo {
  print: (line: string) => void;
  /** test hook: the polling wait */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const apiHttp = async (serverUrl: string, token: string | null, cliVersion: string, fingerprint?: string | null) => {
  const d = await discover(serverUrl);
  return { http: new Http({ baseUrl: d.apiBaseUrl, token, cliVersion, fingerprint }), apiBaseUrl: d.apiBaseUrl, discovery: d };
};

/** RFC 8628 from the CLI side: print the code, poll until approved, denied or expired. */
export async function loginDeviceCode(serverUrl: string, cliVersion: string, io: LoginIo): Promise<DeviceTokenResponse> {
  const { http } = await apiHttp(serverUrl, null, cliVersion);
  const a = await http.post<DeviceAuthorizeResponse>('/v1/devices/authorize', { name: hostname().slice(0, 80) || 'device', platform: platformName(), cliVersion });
  io.print(`Open ${a.verificationUri} and enter ${a.userCode}`);
  let interval = a.intervalSec * 1000;
  const deadline = Date.now() + a.expiresInSec * 1000;
  const sleep = io.sleep ?? wait;
  while (Date.now() < deadline) {
    await sleep(interval);
    try {
      const t = await http.post<DeviceTokenResponse>('/v1/devices/token', { deviceCode: a.deviceCode });
      saveToken(serverUrl, { token: t.token, deviceId: t.deviceId, expiresAt: t.expiresAt });
      return t;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.code === 'AUTHORIZATION_PENDING') continue;
      if (e.code === 'SLOW_DOWN') {
        interval += 5000;
        continue;
      }
      if (e.code === 'ACCESS_DENIED') throw new CliError(e.code, 'ACCESS_DENIED: the request was denied on the web', 4);
      if (e.code === 'EXPIRED_TOKEN') throw new CliError(e.code, 'EXPIRED_TOKEN: the code expired; run the command again', 4);
      throw toCliError(e);
    }
  }
  throw new CliError('EXPIRED_TOKEN', 'EXPIRED_TOKEN: the code expired; run the command again', 4);
}

export async function loginConnect(serverUrl: string, cliVersion: string, code: string): Promise<ConnectResponse> {
  const { http } = await apiHttp(serverUrl, null, cliVersion);
  try {
    const r = await http.post<ConnectResponse>('/v1/devices/connect', { code, name: hostname().slice(0, 80) || 'device', platform: platformName(), cliVersion });
    saveToken(serverUrl, { token: r.token, deviceId: r.deviceId, expiresAt: r.expiresAt });
    return r;
  } catch (e) {
    if (e instanceof ApiError) throw new CliError(e.code, `${e.code}: ${e.message}`, 4);
    throw e;
  }
}

/** Manual only (S27): replaces this device's token. */
export async function rotateToken(serverUrl: string, cliVersion: string): Promise<{ expiresAt: string }> {
  const t = getToken(serverUrl);
  if (!t) throw new CliError('AUTH_REQUIRED', 'AUTH_REQUIRED: run rodo login first', 4);
  const { http } = await apiHttp(serverUrl, t.token, cliVersion);
  try {
    const r = await http.post<{ token: string; expiresAt: string }>('/v1/devices/me/rotate');
    saveToken(serverUrl, { token: r.token, deviceId: t.deviceId, expiresAt: r.expiresAt });
    return { expiresAt: r.expiresAt };
  } catch (e) {
    throw e instanceof ApiError ? toCliError(e) : e;
  }
}

/** Revokes this device on the server (when reachable) and always deletes the local token. */
export async function logout(serverUrl: string, cliVersion: string): Promise<{ revoked: boolean }> {
  const t = getToken(serverUrl);
  let revoked = false;
  if (t) {
    try {
      const { http } = await apiHttp(serverUrl, t.token, cliVersion);
      await http.post('/v1/devices/me/revoke');
      revoked = true;
    } catch {
      /* offline or already revoked: the local token goes anyway */
    }
  }
  if (!process.env.RODO_TOKEN) deleteToken(serverUrl);
  return { revoked };
}
