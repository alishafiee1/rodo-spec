import { CliError } from '../core/errors';

/** An HTTP answer with a status >= 400, or no answer at all (status 0). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get offline(): boolean {
    return this.status === 0;
  }
}

/** ref/12 §7.1: which exit code a request-level error ends the project with. */
export function exitCodeFor(e: ApiError): number {
  if (e.status === 401 || ['DEVICE_TOKEN_INVALID', 'DEVICE_REVOKED', 'DEVICE_EXPIRED', 'CLI_TOO_OLD'].includes(e.code)) return 4;
  if (e.code === 'REPOSITORY_MISMATCH') return 6;
  return 1;
}

export const toCliError = (e: ApiError): CliError => new CliError(e.code, `${e.code}: ${e.message}`, exitCodeFor(e));
