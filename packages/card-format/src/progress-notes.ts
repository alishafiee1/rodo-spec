// note --- Progress notes are local AI session notes inside the description. A board edit that drops the
// whole section (e.g. someone rewrote the description on the web) must not erase them (dogfood P1-1).

const HEAD = /^## Progress notes\s*$/m;

/** The `## Progress notes` section (header included) up to the next `## ` heading, or null. */
export function progressSection(description: string): string | null {
  const m = HEAD.exec(description);
  if (!m) return null;
  const rest = description.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return (m[0] + (next ? rest.slice(0, next.index) : rest)).trimEnd();
}

/**
 * When the incoming (board) description has no Progress notes section but the local one had,
 * append the local section so it is not lost. Returns the description unchanged otherwise.
 */
export function keepProgressNotes(incoming: string, local: string | null | undefined): string {
  if (!local || HEAD.test(incoming)) return incoming;
  const sec = progressSection(local);
  if (!sec) return incoming;
  return incoming.trim() ? `${incoming.trimEnd()}\n\n${sec}` : sec;
}
