import { ApiError } from './errors';

export interface HttpOptions {
  baseUrl: string;
  token?: string | null;
  cliVersion?: string;
  fingerprint?: string | null;
  timeoutMs?: number;
  /** test hook: replaces the 300/900 ms back-off */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestInit2 {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** P3b: retry on 5xx and network errors (3 attempts), never on 4xx. The token only ever goes into the Authorization header. */
export class Http {
  constructor(public readonly opts: HttpOptions) {}

  async request<T>(method: string, path: string, init: RequestInit2 = {}): Promise<T> {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    const url = new URL(path.replace(/^\//, ''), base);
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.opts.token) headers.Authorization = `Bearer ${this.opts.token}`;
    if (this.opts.cliVersion) headers['X-Rodo-Cli-Version'] = this.opts.cliVersion;
    if (this.opts.fingerprint) headers['X-Rodo-Repo-Fingerprint'] = this.opts.fingerprint;
    const sleep = this.opts.sleep ?? wait;

    let last: ApiError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(300 * 3 ** (attempt - 1));
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
        });
        const text = await res.text();
        const json = text ? safeJson(text) : {};
        if (res.ok) return json as T;
        const err = new ApiError(res.status, String(json.code ?? `HTTP_${res.status}`), String(json.message ?? res.statusText), json);
        if (res.status < 500) throw err; // 4xx is final
        last = err;
      } catch (e) {
        if (e instanceof ApiError && e.status !== 0 && e.status < 500) throw e;
        last = e instanceof ApiError ? e : new ApiError(0, 'OFFLINE', e instanceof Error ? e.message : 'network error');
      }
    }
    throw last!;
  }

  get = <T>(path: string, query?: RequestInit2['query']) => this.request<T>('GET', path, { query });
  post = <T>(path: string, body?: unknown) => this.request<T>('POST', path, { body: body ?? {} });
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : { message: text };
  } catch {
    return { message: text.slice(0, 200) };
  }
}
