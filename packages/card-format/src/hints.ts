import { finding } from './codes';
import type { CardModel, Finding, ValidateContext } from './model';

const CYCLE_FOLDER = /^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$/;

/** ref/11 §7 method hints (warnings only). */
export function methodHints(m: CardModel, ctx: ValidateContext, hasRefsSection: boolean): Finding[] {
  const out: Finding[] = [];
  const seg = ctx.relPath.replace(/\\/g, '/').split('/');
  const cyc = seg[0] === 'cycles' && seg.length >= 3;
  const folder = cyc ? seg[1] : null;
  const active = m.status === 'todo' || m.status === 'in_progress';

  if (/\.rodo\.md$/i.test(ctx.relPath) && !/\.rodo\.md$/.test(ctx.relPath)) out.push(finding('FILE_EXT_CASE', null));

  if (cyc && folder) {
    if (!CYCLE_FOLDER.test(folder)) out.push(finding('CYCLE_FOLDER_NAME', null));
    if (seg.length !== 3 || seg[2]!.toLowerCase() !== 'card.rodo.md') out.push(finding('CYCLE_CARD_NAME', null));
    if (!ctx.siblingFiles.includes('simple.md')) out.push(finding('CYCLE_SIMPLE_MISSING', null));
    const own = `/cycles/${folder}/simple.md`;
    if (!hasRefsSection || !m.refs.some((r) => r.path.split('#')[0]!.endsWith(own))) out.push(finding('CYCLE_REFS_MISSING', null));
    if ((m.status === 'in_progress' || m.status === 'blocked') && !/^## Progress notes\s*$/m.test(m.description)) {
      out.push(finding('PROGRESS_NOTES_MISSING', null));
    }
    if (m.status === 'cancelled' && ctx.mapText !== null && !listedInMap(ctx.mapText, folder, MAP_HEADINGS.cancelled)) {
      out.push(finding('CYCLE_CANCELLED_NOT_IN_MAP', null));
    }
    if (m.status === 'done' && ctx.mapText !== null && !listedInMap(ctx.mapText, folder, MAP_HEADINGS.done)) {
      out.push(finding('CYCLE_DONE_NOT_IN_MAP', null));
    }
    if (active && ctx.siblingFiles.includes('spec.md') && !m.scope) out.push(finding('SCOPE_MISSING', null));
    if (active && m.workflow === 'major' && !ctx.siblingFiles.includes('design.md')) out.push(finding('DESIGN_MISSING', null));
  } else if (!m.id && m.status === 'todo' && !/^## Goal\s*$/m.test(m.description)) {
    out.push(finding('REQUEST_GOAL_MISSING', null));
  }
  return out;
}

/** MAP section headings, Persian or English (dogfood P1-3). */
export const MAP_HEADINGS = {
  cancelled: ['لغوشده', 'Cancelled'],
  done: ['انجام‌شده', 'Done'],
} as const;

/** True when MAP.md lists the cycle folder under one of the headings; links may be absolute (/rodo/p/cycles/x/) or relative (cycles/x/). */
export function listedInMap(map: string, folder: string, headings: readonly string[]): boolean {
  const lines = map.split(/\r?\n/);
  const isHead = (l: string) => headings.some((h) => new RegExp(`^##\\s+${h}(\\s|$|[(:—-])`, 'i').test(l.trim()));
  const link = new RegExp(`(^|[/(\\s])cycles/${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|\\)|\\s|$)`);
  for (let start = 0; start < lines.length; start++) {
    if (!isHead(lines[start]!)) continue;
    for (let i = start + 1; i < lines.length && !lines[i]!.startsWith('## '); i++) {
      if (link.test(lines[i]!)) return true;
    }
  }
  return false;
}
