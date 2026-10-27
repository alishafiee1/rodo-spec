import { readFileSync } from 'node:fs';
import type { Ctx } from '../core/context';
import { writeAtomic } from '../core/fs-atomic';
import { gitHead } from '../core/git';
import { pickLang, t } from '../core/i18n';
import { readRuns, recordRun, runTestCommand, setLastFailure } from '../test-runner/run';
import { STUCK_MESSAGE, signatureOf, streak, type RunRecord } from '../test-runner/signature';
import { pickCard, projectCards } from './select';

/** R7: run the optional test command, record the failure signature, print RODO_STUCK on the second identical failure. Never changes the status. */
export async function runTest(ctx: Ctx, query: string | undefined, a: { adapter?: string }): Promise<number> {
  const { d, ref, cards } = projectCards(ctx);
  const card = pickCard(cards, query);
  const lang = pickLang(ctx.opts.lang, ref.project?.language.simple);

  const own = card.model?.test?.command;
  const projectCmd = ref.project?.testCommand;
  const command = (own || projectCmd || '').replaceAll('{NNN}', card.number ?? '');
  if (!command) {
    ctx.out.line(t(lang, 'test.none'));
    ctx.out.flush({ version: 1, card: card.key, ran: false });
    return 0;
  }

  const adapter = a.adapter ?? card.model?.test?.adapter;
  const res = await runTestCommand(command, d.root, { adapter, stream: !ctx.opts.json });
  const passed = res.exitCode === 0;
  const previous = readRuns(ref.dir, card.key);
  const sig = res.failure ? signatureOf(res.adapter, res.failure) : null;
  const n = sig ? streak(previous, sig) : 0;
  const rec: RunRecord = {
    at: Date.now(), command, adapter: res.adapter, exitCode: res.exitCode, passed, signature: sig,
    scenario: res.failure?.scenario ?? '', step: res.failure?.step ?? '', message: (res.failure?.message ?? '').slice(0, 500),
    durationMs: res.durationMs, gitCommit: gitHead(d.root),
  };
  recordRun(ref.dir, card.key, rec, res.output);

  const note = passed ? 'none' : `${sig} ×${n} — ${(res.failure?.message ?? '').replace(/\s+/g, ' ').slice(0, 120)}`;
  const updated = setLastFailure(readFileSync(card.abs, 'utf8'), note, !passed);
  if (updated !== null) writeAtomic(card.abs, updated);

  if (passed) ctx.out.line(`TEST PASSED  ${card.key}  (${res.durationMs} ms)`);
  else ctx.out.line(`TEST FAILED  ${card.key}  ${note}`);
  const stuck = !passed && n >= 2;
  if (stuck) ctx.out.line(STUCK_MESSAGE(sig!));
  ctx.out.flush({ version: 1, card: card.key, ran: true, passed, exitCode: res.exitCode, signature: sig, count: n, stuck, adapter: res.adapter });
  return res.exitCode;
}
