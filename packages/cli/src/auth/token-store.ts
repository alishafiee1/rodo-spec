import { readCredentials, writeCredentials, type StoredToken } from './credentials-file';

const key = (serverUrl: string) => serverUrl.replace(/\/$/, '');

/**
 * ref/15 §2: RODO_TOKEN env (never written to disk), then the credentials file.
 * The OS keychain (@napi-rs/keyring) is optional in the spec and not bundled in this build; the file is the allowed fallback.
 */
export function getToken(serverUrl: string): StoredToken | null {
  const env = process.env.RODO_TOKEN;
  if (env) return { token: env, deviceId: '', expiresAt: '' };
  return readCredentials()[key(serverUrl)] ?? null;
}

export function saveToken(serverUrl: string, t: StoredToken): void {
  writeCredentials({ ...readCredentials(), [key(serverUrl)]: t });
}

export function deleteToken(serverUrl: string): void {
  const all = readCredentials();
  delete all[key(serverUrl)];
  writeCredentials(all);
}
