import type { Ctx } from '../core/context';
import { discover as findProjects } from '../core/discovery';
import { CliError } from '../core/errors';
import { apiHttp, loginConnect, loginDeviceCode, logout, rotateToken } from '../auth/login';
import { getToken } from '../auth/token-store';
import { defaultServer } from './server';
import { CLI_VERSION } from './version';

/** `--server`, else `RODO_SERVER`, else the serverUrl of the project the cwd is in (or the only project that has one), else the default. */
export function resolveServer(ctx: Ctx, flag?: string): string {
  if (flag) return flag.replace(/\/$/, '');
  if (process.env.RODO_SERVER?.trim()) return defaultServer();
  try {
    const d = findProjects(ctx.cwd);
    const own = d.projects.find((p) => p.slug === d.cwdProject)?.project?.serverUrl;
    const any = d.projects.map((p) => p.project?.serverUrl).filter((u): u is string => !!u);
    return (own ?? any[0] ?? defaultServer()).replace(/\/$/, '');
  } catch {
    return defaultServer();
  }
}

export async function runLogin(ctx: Ctx, a: { server?: string; connect?: string; rotate?: boolean }): Promise<number> {
  const server = resolveServer(ctx, a.server);
  if (a.rotate) {
    const r = await rotateToken(server, CLI_VERSION);
    ctx.out.line(`Token replaced. New expiry: ${r.expiresAt}`);
    ctx.out.flush({ version: 1, server, rotated: true, expiresAt: r.expiresAt });
    return 0;
  }
  const t = a.connect
    ? await loginConnect(server, CLI_VERSION, a.connect)
    : await loginDeviceCode(server, CLI_VERSION, { print: (l) => process.stderr.write(`${l}\n`), sleep: ctx.sleep });
  ctx.out.line(`Logged in as ${t.user.username} on ${server}. Token expires ${t.expiresAt}.`);
  ctx.out.flush({ version: 1, server, user: t.user.username, scopes: t.scopes, expiresAt: t.expiresAt });
  return 0;
}

export async function runLogout(ctx: Ctx, a: { server?: string }): Promise<number> {
  const server = resolveServer(ctx, a.server);
  const r = await logout(server, CLI_VERSION);
  ctx.out.line(r.revoked ? 'This device was revoked on the server and the local token was deleted.' : 'The local token was deleted (the server could not be told; revoke the device on the web if needed).');
  ctx.out.flush({ version: 1, server, revoked: r.revoked });
  return 0;
}

/** `rodo devices`: prints where the devices page is; the list itself is a person's job on the web. */
export async function runDevices(ctx: Ctx, a: { server?: string }): Promise<number> {
  const server = resolveServer(ctx, a.server);
  const t = getToken(server);
  const lines = [`Devices page: ${server}/devices`];
  if (t) {
    try {
      const { http } = await apiHttp(server, t.token, CLI_VERSION);
      const me = await http.get<{ name: string; scopes: string[]; expiresAt: string | null }>('/v1/devices/me');
      lines.push(`This device: ${me.name} · scopes ${me.scopes.join(', ')} · expires ${me.expiresAt ?? '?'}`);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      lines.push('This device: the token is not accepted (run rodo login)');
    }
  } else lines.push('This device: not logged in');
  for (const l of lines) ctx.out.line(l);
  ctx.out.flush({ version: 1, server, url: `${server}/devices` });
  return 0;
}

export { CliError };
