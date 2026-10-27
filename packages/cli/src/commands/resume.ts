import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CardFile } from '../core/cards';
import type { Ctx } from '../core/context';
import { readJson } from '../core/fs-atomic';
import { pickLang, t } from '../core/i18n';
import { ago, stamp } from '../core/time';
import { cardLabel } from '../core/cards';
import type { LastSync } from '../sync/offline';
import { readLastOutput, readRuns } from '../test-runner/run';
import { streak } from '../test-runner/signature';
import { pickCard, projectCards } from './select';

const MAP_WHAT = /^##\s*(این پروژه چیست|What this project is)/i;
const MAP_WHERE = /^##\s*(الان کجاییم|Where we are)/i;

/** Non-empty, non-quote lines under the first heading that matches, up to `max`. */
function section(md: string | null, heading: RegExp, max: number): string[] {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length && !lines[i]!.startsWith('## '); i++) {
    const l = lines[i]!.trim();
    if (l && !l.startsWith('>') && !/^\{\{.*\}\}$/.test(l)) out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

/** `## Goal` section of the description, else its first paragraph. */
function goal(desc: string): string[] {
  const g = section(desc, /^##\s*Goal\s*$/, 6);
  if (g.length) return g;
  const para: string[] = [];
  for (const l of desc.split(/\r?\n/)) {
    if (l.startsWith('## ')) break;
    if (l.trim()) para.push(l.trim()); else if (para.length) break;
    if (para.length >= 6) break;
  }
  return para;
}

const noteLine = (desc: string, label: string): string | null => {
  const m = new RegExp(`^- ${label}:\\s*(.*)$`, 'mi').exec(desc);
  return m ? m[1]!.trim() : null;
};

const head = (text: string, n: number): string => text.split(/\r?\n/).slice(0, n).join('\n');
const readIf = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf8') : null);

export interface ResumeData {
  project: string; at: number; lastSyncAt: number | null;
  card: { key: string; title: string; status: string; workflow: string | null; path: string };
  fields: Record<string, string | string[]>;
  full?: Record<string, string>;
  hints: string[];
}

export async function runResume(ctx: Ctx, query: string | undefined, a: { full?: boolean }): Promise<number> {
  const { d, ref, cards } = projectCards(ctx);
  const card = pickCard(cards, query);
  const m = card.model;
  if (!m) {
    ctx.out.line(`${card.path} is not a readable card:`);
    for (const e of card.errors) ctx.out.line(`  ${e.message}`);
    ctx.out.flush({ version: 1, card: card.key, errors: card.errors });
    return 2;
  }
  const lang = pickLang(ctx.opts.lang, ref.project?.language.simple);
  const now = Date.now();
  const last = readJson<LastSync>(join(ref.dir, '.rodo', 'last-sync.json'));
  const mapText = readIf(join(ref.dir, 'MAP.md'));
  const memText = readIf(join(ref.dir, 'MEMORY.md'));
  const desc = m.description;

  const approvals = m.checklists.flatMap((c) => c.items).filter((i) => i.kind === 'approval');
  const approval = !approvals.length ? 'none' : approvals.every((i) => i.isDone) ? 'approved' : 'waiting for the user (do not code)';
  const decisions = m.decisions.map((x) =>
    x.answer
      ? `answered: "${x.question}" → ${x.answer.key}${x.answer.note ? ` — ${x.answer.note}` : ''}`
      : `open: "${x.question}" (${x.options.map((o) => `${o.key} ${o.text}`).join(', ')})`);
  const steps = m.checklists.flatMap((c) => c.items).filter((i) => i.kind === 'task' && !i.isDone).map((i) => i.title);
  const remaining = [noteLine(desc, 'Remaining'), ...steps].filter(Boolean).slice(0, 8) as string[];
  const projectCmd = ref.project?.testCommand;
  const command = m.test?.command ?? (projectCmd ? projectCmd.replaceAll('{NNN}', card.number ?? '') : null);
  const runs = readRuns(ref.dir, card.key);
  const lastRun = runs[runs.length - 1];
  const lastFail = lastRun && !lastRun.passed && lastRun.signature
    ? `${lastRun.signature} ×${streak(runs.slice(0, -1), lastRun.signature)} — ${lastRun.message.slice(0, 120)}   [from .rodo/runs]`
    : 'none';
  const mem = (memText ?? '').split(/\r?\n/).filter((l) => l.startsWith('- ') && !l.includes('{{')).slice(-5);
  const dirOfCard = dirname(card.abs);

  const fields: ResumeData['fields'] = {
    PROJECT: section(mapText, MAP_WHAT, 5),
    WHERE: section(mapText, MAP_WHERE, 5),
    GOAL: goal(desc),
    SCOPE: m.scope ? `allowed: ${m.scope.allowed.join(', ') || '—'}   forbidden: ${m.scope.forbidden.join(', ') || '—'}` : 'none',
    APPROVAL: approval,
    DONE: noteLine(desc, 'Done') ?? 'none',
    REMAINING: remaining.length ? remaining : 'none',
    BLOCKER: m.statusReason ?? 'none',
    DECISIONS: decisions.length ? decisions.join(' | ') : 'none',
    TEST: command ? `${command} (adapter ${m.test?.adapter ?? 'other'})` : 'none (tests are optional)',
    'LAST FAIL': lastFail,
    FILES: m.refs.map((r) => r.path),
    'DECISIONS-MEM': mem.length ? mem : 'none',
    RULES: 'read .agents/skills/rodo/SKILL.md (session protocol) — run `rodo sync` at the end',
  };

  const hints: string[] = [];
  // "never synced" only for a bound project (an unbound one cannot sync); stale as before (dogfood #11)
  if (!last) { if (ref.project?.boardId) hints.push(t(lang, 'resume.never')); }
  else if (now - last.finishedAt > 3_600_000) hints.push(t(lang, 'resume.stale'));

  const cardLine = `${card.number ? cardLabel(card.number, m.title, ' — ') : `${card.key} — ${m.title}`}   status: ${m.status}${m.status === 'blocked' && m.blockerType ? ` (${m.blockerType})` : ''}${m.workflow ? `   workflow: ${m.workflow}` : ''}   path: rodo/${ref.legacy ? '' : ref.slug + '/'}${card.path}`;
  ctx.out.line(`RODO CONTEXT (compact) — project ${ref.slug} — ${stamp(now)} — last sync ${last ? ago(last.finishedAt, now) : 'never'}`);
  const put = (label: string, v: string | string[]) => {
    const lines = Array.isArray(v) ? v : [v];
    const pad = label.padEnd(14);
    if (!lines.length) { ctx.out.line(`${pad}none`); return; }
    lines.forEach((l, i) => ctx.out.line(`${i === 0 ? pad : ' '.repeat(14)}${l}`));
  };
  const order = ['PROJECT', 'WHERE'] as const;
  for (const k of order) put(k, fields[k]!);
  put('CARD', cardLine);
  for (const k of ['GOAL', 'SCOPE', 'APPROVAL', 'DONE', 'REMAINING', 'BLOCKER', 'DECISIONS', 'TEST', 'LAST FAIL', 'FILES', 'DECISIONS-MEM', 'RULES']) put(k, fields[k]!);

  let full: Record<string, string> | undefined;
  if (a.full) {
    full = {};
    const add = (name: string, p: string) => { const x = readIf(p); if (x !== null) full![name] = head(x, 400); };
    add('simple.md', join(dirOfCard, 'simple.md'));
    add('spec.md', join(dirOfCard, 'spec.md'));
    add('acceptance.feature', join(dirOfCard, 'acceptance.feature'));
    add('project/architecture.md', join(ref.dir, 'project', 'architecture.md'));
    const out = readLastOutput(ref.dir, card.key);
    if (out) full['last test output'] = out;
    for (const [name, text] of Object.entries(full)) {
      ctx.out.line('');
      ctx.out.line(`=== ${name} ===`);
      ctx.out.line(text);
    }
  }
  for (const h of hints) ctx.out.line(`HINT        ${h}`);
  const data: ResumeData = {
    project: ref.slug, at: now, lastSyncAt: last?.finishedAt ?? null,
    card: { key: card.key, title: m.title, status: m.status, workflow: m.workflow ?? null, path: `rodo/${ref.slug}/${card.path}` },
    fields, ...(full ? { full } : {}), hints,
  };
  ctx.out.flush({ version: 1, ...data });
  return 0;
}

export type { CardFile };
