import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeAtomic } from './fs-atomic';

export interface ProjectJson {
  schemaVersion: 2;
  projectSlug: string;
  name: string;
  serverUrl: string | null;
  boardId: string | null;
  repoFingerprint: string | null;
  language: { simple: 'fa' | 'en'; technical: string };
  testCommand: string | null;
  stepsDirs: string[];
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

export function slugify(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '');
  return SLUG_RE.test(slug) ? slug : 'project';
}

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return `project slug must match ${SLUG_RE.source}`;
  if (slug === 'kit') return '"kit" is a reserved name';
  return null;
}

export interface ProjectRead { project: ProjectJson | null; problem: string | null }

/** Reads `<dir>/project.json` and checks it against the folder name (ref/13 §1). */
export function readProject(dir: string, slug: string): ProjectRead {
  const path = join(dir, 'project.json');
  if (!existsSync(path)) return { project: null, problem: 'project.json is missing' };
  const p = readJson<Partial<ProjectJson>>(path);
  if (!p || typeof p !== 'object') return { project: null, problem: 'project.json is not valid JSON' };
  if (p.projectSlug !== slug) return { project: null, problem: `projectSlug "${String(p.projectSlug)}" does not match the folder "${slug}"` };
  const bad = slugProblem(slug);
  if (bad) return { project: null, problem: bad };
  return {
    project: {
      schemaVersion: 2,
      projectSlug: slug,
      name: p.name ?? slug,
      serverUrl: p.serverUrl ?? null,
      boardId: p.boardId ?? null,
      repoFingerprint: p.repoFingerprint ?? null,
      language: { simple: p.language?.simple === 'en' ? 'en' : 'fa', technical: p.language?.technical ?? 'en' },
      testCommand: p.testCommand ?? null,
      stepsDirs: Array.isArray(p.stepsDirs) ? p.stepsDirs : [],
    },
    problem: null,
  };
}

/** JSON with short primitive-only arrays/objects on one line, like the kit template, so a bind gives a small git diff (dogfood #19). */
export function formatProjectJson(p: unknown): string {
  const s = JSON.stringify(p, null, 2);
  const one = s
    .replace(/\[\n\s*([^\[\]{}\n]*(?:\n\s*[^\[\]{}\n]*)*?)\n\s*\]/g, (m, body: string) => {
      const items = body.split(/,\n\s*/).map((x) => x.trim());
      const line = `[${items.join(', ')}]`;
      return line.length <= 80 ? line : m;
    })
    .replace(/\{\n\s*("[^"\n]+": [^{}\[\]\n]+(?:,\n\s*"[^"\n]+": [^{}\[\]\n]+)*)\n\s*\}/g, (m, body: string, offset: number) => {
      if (offset === 0) return m; // the top-level object stays multi-line
      const line = `{ ${body.split(/,\n\s*/).map((x) => x.trim()).join(', ')} }`;
      return line.length <= 80 ? line : m;
    });
  return one + '\n';
}

export const writeProject = (dir: string, p: ProjectJson): void => writeAtomic(join(dir, 'project.json'), formatProjectJson(p));
