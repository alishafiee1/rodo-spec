import { scanCards, findCard, type CardFile } from '../core/cards';
import type { Ctx } from '../core/context';
import type { Discovery, ProjectRef } from '../core/discovery';
import { CliError, usage } from '../core/errors';
import { load } from './shared';

/** resume / test work on one project: --project, else the one the cwd is in, else the only one (ref/13 §0). */
export function oneProject(ctx: Ctx): { d: Discovery; ref: ProjectRef } {
  const { d, refs } = load(ctx, true);
  if (refs.length !== 1) throw usage(`several projects (${refs.map((r) => r.slug).join(', ')}): use --project <slug>`);
  return { d, ref: refs[0]! };
}

/**
 * A named card, else the single in_progress card, else the single blocked card (ref/13 §6).
 * Several candidates: list them and exit 2.
 */
export function pickCard(cards: CardFile[], query: string | undefined): CardFile {
  if (query) {
    const c = findCard(cards, query);
    if (!c) throw usage(`no card matches "${query}"`);
    return c;
  }
  for (const status of ['in_progress', 'blocked'] as const) {
    const list = cards.filter((c) => c.model?.status === status);
    if (list.length === 1) return list[0]!;
    if (list.length > 1) throw usage(`several ${status} cards, name one:\n${list.map((c) => `  ${c.number ?? c.key}  ${c.model?.title}`).join('\n')}`);
  }
  throw new CliError('NO_ACTIVE_CARD', 'no in_progress or blocked card; name one (rodo resume <card>)', 2);
}

export function projectCards(ctx: Ctx): { d: Discovery; ref: ProjectRef; cards: CardFile[] } {
  const { d, ref } = oneProject(ctx);
  return { d, ref, cards: scanCards(d.root, ref) };
}
