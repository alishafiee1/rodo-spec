import { failureSignature } from '@rodo/card-format';
import type { Failure } from './parsers/generic';

export interface RunRecord {
  at: number;
  command: string;
  adapter: string;
  exitCode: number;
  passed: boolean;
  signature: string | null;
  scenario: string;
  step: string;
  message: string;
  durationMs: number;
  gitCommit: string | null;
}

export const signatureOf = (adapter: string, f: Failure): string =>
  failureSignature({ adapter, scenario: f.scenario, step: f.step, errorType: f.errorType, message: f.message }).short;

/** `n` for the run being recorded: consecutive earlier runs with the same signature since the last pass, plus this one. */
export function streak(previous: RunRecord[], sig: string): number {
  let n = 1;
  for (let i = previous.length - 1; i >= 0; i--) {
    const r = previous[i]!;
    if (r.passed || r.signature !== sig) break;
    n++;
  }
  return n;
}

export const STUCK_MESSAGE = (sig: string): string =>
  `RODO_STUCK: the same failure happened twice (${sig}). Per the RODO method: set status: blocked, blockerType: test or technical, write the reason in statusReason, and ask the user.`;
