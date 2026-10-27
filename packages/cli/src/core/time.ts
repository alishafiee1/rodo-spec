// note --- times are shown in the user's own timezone (the system zone, or TZ), with the zone name as the label (dogfood #8)

const fmtFor = (timeZone?: string) => new Intl.DateTimeFormat('sv-SE', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** The IANA zone the times are shown in ("Europe/Madrid"); `RODO_TZ` overrides the system zone. */
export const zoneName = (env: NodeJS.ProcessEnv = process.env): string => {
  const z = env.RODO_TZ?.trim();
  if (z) {
    try { fmtFor(z); return z; } catch { /* invalid zone: fall back to the system one */ }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
};

/** "2026-10-07 11:45" in the given zone (default: zoneName()). */
export const localTime = (ms: number, zone: string = zoneName()): string => fmtFor(zone).format(new Date(ms)).replace(/\u00a0/g, ' ');

/** "2026-10-07 11:45 (Europe/Madrid)" */
export const stamp = (ms: number, zone: string = zoneName()): string => `${localTime(ms, zone)} (${zone})`;

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
