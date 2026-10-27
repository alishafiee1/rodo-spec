import type { Finding } from '@rodo/card-format';
import type { Ctx } from '../core/context';
import { CliError, usage } from '../core/errors';
import { mark } from '../core/output';
import { runOfflineSync } from '../sync/offline';
import { syncProject } from '../sync/run';
import { LEGACY_MSG, load, printFindings } from './shared';
import { CLI_VERSION } from './version';

export interface SyncArgs { offline?: boolean; dryRun?: boolean; pullOnly?: boolean; pushOnly?: boolean; confirmArchive?: boolean; check?: boolean }

/** `rodo sync`: pull, merge, push, write back, report (ref/12 §7). `--offline` validates only. */
export async function runSync(ctx: Ctx, a: SyncArgs, lockWaitMs?: number): Promise<number> {
  if (a.pullOnly && a.pushOnly) throw usage('--pull-only and --push-only cannot be used together');
  const { d, refs } = load(ctx, false);
  let exit = 0;
  const data: unknown[] = [];
  for (const ref of refs) {
    if (ref.legacy) {
      ctx.out.line(LEGACY_MSG);
      ctx.out.line(`rodo/  ▸ sync refuses until the layout is migrated`);
      exit = Math.max(exit, 3);
      continue;
    }
    try {
      if (a.offline) {
        const { report, cards } = await runOfflineSync(d.root, ref, { dryRun: a.dryRun, lockWaitMs });
        const s = report.summary;
        ctx.out.line(`rodo/${ref.slug}  ▸ offline · files ${s.files} · errors ${s.errors} · warnings ${s.warnings}${a.dryRun ? '  (dry run: nothing written)' : ''}`);
        printFindings(ctx, cards);
        data.push(report);
        continue;
      }
      const run = await syncProject(d.root, ref, a, CLI_VERSION, lockWaitMs);
      ctx.out.line(run.header);
      for (const n of run.notes) ctx.out.line(`  ${mark.warn} ${n}`);
      for (const c of run.cards) {
        const x = run.extra.get(c.path);
        const line = (f: Finding, icon: string) => ctx.out.line(`  ${icon} ${c.path}${f.line ? `:${f.line}` : ''}  ${f.message}`);
        for (const f of [...c.errors, ...(x?.errors ?? [])]) line(f, mark.err);
        for (const f of [...c.warnings, ...(x?.warnings ?? [])]) line(f, mark.warn);
      }
      data.push(run.report);
      exit = Math.max(exit, run.exit);
    } catch (e) {
      if (!(e instanceof CliError) || e.exitCode !== 5) throw e;
      ctx.out.line(e.message);
      exit = Math.max(exit, 5);
    }
  }
  ctx.out.flush({ version: 1, ...(a.offline ? { mode: 'offline' } : {}), projects: data });
  return exit;
}
