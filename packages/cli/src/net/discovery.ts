import { Http } from './http';

/** `/.well-known/rodo.json`; a server without one serves the API at its own URL. A dead server is reported as offline. */
export async function discover(serverUrl: string): Promise<{ apiBaseUrl: string; minCliVersion: string | null; latestKitVersion: string | null }> {
  try {
    const d = await new Http({ baseUrl: serverUrl, timeoutMs: 10_000 }).get<{ apiBaseUrl?: string; minCliVersion?: string; latestKitVersion?: string }>('/.well-known/rodo.json');
    return { apiBaseUrl: (d.apiBaseUrl || serverUrl).replace(/\/$/, ''), minCliVersion: d.minCliVersion ?? null, latestKitVersion: d.latestKitVersion ?? null };
  } catch (e) {
    if ((e as { offline?: boolean }).offline) throw e;
    return { apiBaseUrl: serverUrl.replace(/\/$/, ''), minCliVersion: null, latestKitVersion: null };
  }
}
