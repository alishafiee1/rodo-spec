import type { CardStatus } from '@rodo/protocol';

/**
 * Kit 2.0 fallback (G2): the reason of a blocked/cancelled card used to live in the
 * Progress notes line `- Blocker: <reason>` / `- Cancelled: <reason>`.
 * Empty or `none` means no reason.
 */
export function readLegacyReason(description: string, status: CardStatus): string | null {
  const label = status === 'blocked' ? 'Blocker' : status === 'cancelled' ? 'Cancelled' : null;
  if (!label) return null;
  const m = new RegExp(`^\\s*-\\s*${label}:[ \\t]*(.*?)[ \\t]*$`, 'm').exec(description.replace(/\r\n?/g, '\n'));
  const v = m?.[1]?.trim() ?? '';
  return v === '' || v.toLowerCase() === 'none' ? null : v.slice(0, 500);
}
