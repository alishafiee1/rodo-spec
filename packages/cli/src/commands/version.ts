import type { Ctx } from '../core/context';
import { loadKit } from '../kit/install';
import pkg from '../../package.json';

export const CLI_VERSION: string = pkg.version;

export async function runVersion(ctx: Ctx): Promise<number> {
  const kit = loadKit().manifest.version;
  ctx.out.line(`rodo ${CLI_VERSION}`);
  ctx.out.line(`kit ${kit}`);
  ctx.out.line(`node ${process.versions.node}`);
  ctx.out.line('server minCliVersion: unknown (not connected)');
  ctx.out.flush({ version: 1, cli: CLI_VERSION, kit, node: process.versions.node, minCliVersion: null });
  return 0;
}
