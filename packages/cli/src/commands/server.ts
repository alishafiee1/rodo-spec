/** Built-in board server. The site address is not final: override with `RODO_SERVER` or `--server`. */
export const BUILTIN_SERVER = 'https://rodo.n3xus.ir';

/** `RODO_SERVER` env (trimmed, no trailing slash), else the built-in address. */
export function defaultServer(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.RODO_SERVER?.trim();
  return (v ? v : BUILTIN_SERVER).replace(/\/+$/, '');
}

/** @deprecated kept for callers that read it as a constant; prefer defaultServer(). */
export const DEFAULT_SERVER = BUILTIN_SERVER;
