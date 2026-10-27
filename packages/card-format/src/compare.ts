// ref/11 §10.1 --- one comparison rule shared by the CLI and the server (GM3) ---

const TEHRAN = '+03:30'; // ponytail: fixed offset, Iran has no DST since 2022; revisit if that changes
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function normText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

export function toEpoch(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return v;
  const t = Date.parse(DATE_ONLY.test(v) ? `${v}T00:00:00${TEHRAN}` : v);
  return Number.isNaN(t) ? v : t;
}

const sortedUnique = (v: unknown): string[] =>
  Array.from(new Set(((v as string[]) ?? []).map((s) => s.normalize('NFC')))).sort();

const emptyToNull = (v: unknown): unknown => {
  if (v === '' || v === undefined) return null;
  if (Array.isArray(v)) return v.length ? v.map(emptyToNull) : null;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = emptyToNull((v as Record<string, unknown>)[k]);
    return Object.values(out).every((x) => x === null) ? null : out;
  }
  return v;
};

/** Field names: title, description, statusReason, text, startAt, dueAt, date, members, labels, hours, minutes, scope, list, status, financial, ... */
export function normalizeForCompare(field: string, value: unknown): unknown {
  switch (field) {
    case 'description':
    case 'statusReason':
    case 'text':
      return typeof value === 'string' ? emptyToNull(normText(value)) : emptyToNull(value);
    case 'title':
      return typeof value === 'string' ? value.trim().normalize('NFC') : value;
    case 'startAt':
    case 'dueAt':
    case 'date':
      return toEpoch(value);
    case 'members':
    case 'labels':
      return emptyToNull(sortedUnique(value));
    case 'hours':
    case 'hoursMinutes':
    case 'minutes':
      return value === null || value === undefined ? null : Number(value);
    case 'scope': {
      if (!value) return null;
      const s = value as { allowed?: string[]; forbidden?: string[] };
      const f = (l?: string[]) => (l ?? []).map((x) => x.trim().normalize('NFC'));
      return emptyToNull({ allowed: f(s.allowed), forbidden: f(s.forbidden) });
    }
    case 'list':
      return value === null || value === undefined || value === '' ? null : String(value).trim().normalize('NFC');
    case 'status': {
      if (!value || typeof value !== 'object') return value;
      const s = value as Record<string, unknown>;
      return {
        status: s.status,
        list: normalizeForCompare('list', s.list),
        statusReason: normalizeForCompare('statusReason', s.statusReason),
        blockerType: s.blockerType ?? null,
      };
    }
    case 'financial': {
      if (!value) return null;
      const f = value as Record<string, unknown>;
      return { type: f.type ?? 'none', amount: f.amount ?? 0, category: f.category ?? 'general', date: toEpoch(f.date) };
    }
    default:
      return emptyToNull(value);
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function fieldEquals(field: string, a: unknown, b: unknown): boolean {
  const na = normalizeForCompare(field, a);
  const nb = normalizeForCompare(field, b);
  if (field === 'status' && na && nb && typeof na === 'object' && typeof nb === 'object') {
    // a null list means "server picks by status", equal to any list
    const x = na as Record<string, unknown>;
    const y = nb as Record<string, unknown>;
    const listOk = x.list === null || y.list === null || x.list === y.list;
    return listOk && x.status === y.status && deepEqual(x.statusReason, y.statusReason) && deepEqual(x.blockerType, y.blockerType);
  }
  return deepEqual(na, nb);
}
