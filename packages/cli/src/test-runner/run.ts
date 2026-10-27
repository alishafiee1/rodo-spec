import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Failure } from './parsers/generic';
import { parseGeneric } from './parsers/generic';
import { parseJest } from './parsers/jest';
import { parsePlaywright } from './parsers/playwright';
import type { RunRecord } from './signature';

export interface RunResult { exitCode: number; output: string; durationMs: number; failure: Failure | null; adapter: string }

const TAIL_BYTES = 2_000_000;

/** Adds a JSON report to Playwright / Jest commands (ref/13 §7 step 3) without changing what the user sees. */
export function withReporters(command: string, report: string): { command: string; env: Record<string, string> } {
  if (/playwright\s+test/.test(command) && !/--reporter/.test(command)) {
    return { command: `${command} --reporter=list,json`, env: { PLAYWRIGHT_JSON_OUTPUT_NAME: report } };
  }
  if (/\bjest\b/.test(command) && !/--json/.test(command)) return { command: `${command} --json --outputFile="${report}"`, env: {} };
  return { command, env: {} };
}

export async function runTestCommand(command: string, cwd: string, opts: { adapter?: string; stream: boolean }): Promise<RunResult> {
  const report = join(tmpdir(), `rodo-test-${process.pid}-${Date.now()}.json`);
  const wrapped = withReporters(command, report);
  const t0 = Date.now();
  let output = '';
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(wrapped.command, { cwd, shell: true, env: { ...process.env, ...wrapped.env }, stdio: ['inherit', 'pipe', 'pipe'] });
    const take = (b: Buffer, sink: NodeJS.WriteStream) => {
      if (opts.stream) sink.write(b);
      output = (output + b.toString('utf8')).slice(-TAIL_BYTES);
    };
    child.stdout.on('data', (b: Buffer) => take(b, process.stdout));
    child.stderr.on('data', (b: Buffer) => take(b, process.stderr));
    child.on('error', (e) => { output += `\nError: ${e.message}`; resolve(127); });
    child.on('close', (c) => resolve(c ?? 1));
  });
  const durationMs = Date.now() - t0;
  let failure: Failure | null = null;
  let adapter = opts.adapter ?? 'other';
  if (exitCode !== 0) {
    const json = existsSync(report) ? readFileSync(report, 'utf8') : '';
    const pw = json ? parsePlaywright(json) : null;
    const jest = pw ? null : json ? parseJest(json) : null;
    if (pw) { failure = pw; adapter = opts.adapter ?? 'web'; }
    else if (jest) { failure = jest; adapter = opts.adapter ?? 'api'; }
    else failure = parseGeneric(output);
  }
  rmSync(report, { force: true });
  return { exitCode, output, durationMs, failure, adapter };
}

// ---- .rodo/runs ----

export const runsFile = (projectDir: string, key: string) => join(projectDir, '.rodo', 'runs', `${key}.jsonl`);

export function readRuns(projectDir: string, key: string): RunRecord[] {
  const p = runsFile(projectDir, key);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l) as RunRecord]; } catch { return []; }
  });
}

export function recordRun(projectDir: string, key: string, rec: RunRecord, output: string): void {
  mkdirSync(join(projectDir, '.rodo', 'runs'), { recursive: true });
  appendFileSync(runsFile(projectDir, key), JSON.stringify(rec) + '\n');
  writeFileSync(join(projectDir, '.rodo', 'runs', `${key}.last.txt`), output.split(/\r?\n/).slice(-60).join('\n'));
}

export const readLastOutput = (projectDir: string, key: string): string | null => {
  const p = join(projectDir, '.rodo', 'runs', `${key}.last.txt`);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

// ---- the card's `- Last failure:` line ----

/** Sets the `- Last failure:` line in `## Progress notes` (adds the line, or the section, when missing). Returns null if nothing changes. */
export function setLastFailure(text: string, value: string, createSection: boolean): string | null {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const trailing = /\n$/.test(text);
  const lines = text.split(/\r?\n/);
  if (trailing) lines.pop();
  const line = `- Last failure: ${value}`;

  const fm0 = lines.findIndex((l) => l.trimEnd() === '---');
  const fm1 = fm0 < 0 ? -1 : lines.findIndex((l, i) => i > fm0 && l.trimEnd() === '---');
  const bodyStart = fm1 + 1;
  const h = lines.findIndex((l, i) => i >= bodyStart && l.trimEnd() === '## Progress notes');

  if (h >= 0) {
    let end = lines.findIndex((l, i) => i > h && l.startsWith('## '));
    if (end < 0) end = lines.length;
    const at = lines.findIndex((l, i) => i > h && i < end && l.startsWith('- Last failure:'));
    if (at >= 0) { if (lines[at] === line) return null; lines[at] = line; }
    else {
      let last = end - 1;
      while (last > h && !lines[last]!.trim()) last--;
      lines.splice(last + 1, 0, line);
    }
  } else {
    if (!createSection) return null;
    let at = lines.findIndex((l, i) => i >= bodyStart && /^## (Refs|Decision: |Checklist: )/.test(l));
    if (at < 0) at = lines.length;
    const block = ['## Progress notes', '', line, ''];
    if (at > 0 && lines[at - 1]!.trim()) block.unshift('');
    if (at === lines.length) block.pop();
    lines.splice(at, 0, ...block);
  }
  return lines.join(eol) + (trailing ? eol : '');
}
