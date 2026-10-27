import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { notRepo } from './errors';
import { readProject, type ProjectJson } from './project';

export interface ProjectRef {
  slug: string;
  dir: string;
  /** null when project.json is invalid, or for the legacy v2.0 layout (rodo/ itself) */
  project: ProjectJson | null;
  problem: string | null;
  legacy: boolean;
}

export interface Discovery {
  root: string;
  hasGit: boolean;
  projects: ProjectRef[];
  legacy: boolean;
  /** project the cwd is inside, if any */
  cwdProject: string | null;
}

/** ref/13 §0 rule 1: first folder with `.git`, else with `rodo/kit.json`. */
export function findRoot(cwd: string): { root: string; hasGit: boolean } | null {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return { root: dir, hasGit: true };
    if (existsSync(join(dir, 'rodo', 'kit.json'))) return { root: dir, hasGit: false };
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export const isLegacyLayout = (root: string): boolean =>
  existsSync(join(root, 'rodo', 'MAP.md')) || existsSync(join(root, 'rodo', 'config.json'));

export function discover(cwd: string): Discovery {
  const found = findRoot(cwd);
  if (!found) throw notRepo('not inside a git repository or a RODO repo (no .git, no rodo/kit.json)');
  const { root, hasGit } = found;
  const rodo = join(root, 'rodo');
  const projects: ProjectRef[] = [];
  const legacy = isLegacyLayout(root);
  if (existsSync(rodo)) {
    for (const name of readdirSync(rodo).sort()) {
      const dir = join(rodo, name);
      if (!statSync(dir).isDirectory() || !existsSync(join(dir, 'project.json'))) continue;
      const r = readProject(dir, name);
      projects.push({ slug: name, dir, project: r.project, problem: r.problem, legacy: false });
    }
  }
  if (legacy) projects.push({ slug: 'legacy', dir: rodo, project: null, problem: null, legacy: true });
  const rel = relative(rodo, resolve(cwd));
  const first = rel && !rel.startsWith('..') ? rel.split(sep)[0]! : null;
  const cwdProject = first && projects.some((p) => p.slug === first && !p.legacy) ? first : null;
  return { root, hasGit, projects, legacy, cwdProject };
}

/** `--project` (repeatable) wins; else the project the cwd is in, for commands that default to one; else all. */
export function selectProjects(d: Discovery, names: string[], defaultToCwd: boolean): ProjectRef[] {
  if (names.length) {
    return names.map((n) => {
      const p = d.projects.find((x) => x.slug === n);
      if (!p) throw notRepo(`project "${n}" not found under rodo/`);
      return p;
    });
  }
  if (defaultToCwd && d.cwdProject) return d.projects.filter((p) => p.slug === d.cwdProject);
  return d.projects;
}
