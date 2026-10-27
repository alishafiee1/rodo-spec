/** Exit codes: ref/12 §7.1 + ref/13 §2. */
export class CliError extends Error {
  constructor(public code: string, message: string, public exitCode = 1) {
    super(message);
  }
}
export const usage = (m: string) => new CliError('USAGE', m, 2);
export const notRepo = (m: string) => new CliError('NOT_RODO_REPO', m, 3);
