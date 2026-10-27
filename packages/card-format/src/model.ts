import type { BlockerType, CardStatus, MetaResponse } from '@rodo/protocol';

export type { BlockerType, CardStatus };
export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type CoverColor = 'purple' | 'orange' | 'green' | 'sky' | 'yellow' | 'pink';
export type TestAdapter = 'web' | 'api' | 'cli' | 'mobile' | 'iot' | 'other';
export type Workflow = 'quick' | 'standard' | 'major';

export interface RefModel { id?: string; title: string; path: string }
export interface DecisionModel {
  id?: string; tempId?: string; question: string;
  options: { key: string; text: string }[];
  answer: { key: string; note: string | null } | null;
}
export interface ItemModel {
  id?: string; tempId?: string; title: string; isDone: boolean;
  assignee: string | null; minutes: number; kind: 'task' | 'approval';
}
export interface ChecklistModel { id?: string; tempId?: string; title: string; items: ItemModel[] }

export interface CardModel {
  schemaVersion: 1 | 2;
  id?: string; tempId?: string; boardId?: string;
  title: string;
  status: CardStatus;
  statusReason: string | null;
  blockerType: BlockerType | null;
  list?: string;
  priority: Priority;
  members: string[]; labels: string[];
  startAt: string | null; dueAt: string | null;
  coverColor: CoverColor | null;
  hoursMinutes: number | null;
  financial: { type: 'none' | 'expense' | 'income'; amount: number; category: string; date: string | null };
  scope: { allowed: string[]; forbidden: string[] } | null;
  test: { adapter: TestAdapter; command: string } | null;
  workflow?: Workflow; // local-only, never sent
  updatedAt: number | null;
  locked: boolean;
  description: string;
  refs: RefModel[];
  decisions: DecisionModel[];
  checklists: ChecklistModel[];
  extras: Record<string, unknown>; // x-* keys, never sent
}

export interface Finding { code: string; line: number | null; message: string }

export type BoardMeta = Pick<MetaResponse, 'lists' | 'labels' | 'members' | 'capabilities'>;

export interface ValidateContext {
  relPath: string;
  projectSlug: string | null;
  boundBoardId: string | null;
  base: CardModel | null;
  meta: BoardMeta | null;
  repoFileExists: (repoPath: string) => boolean;
  siblingFiles: string[];
  mapText: string | null;
  /** card id -> relPath of the other file already using it (CARD_ID_DUPLICATE) */
  knownIds?: Record<string, string>;
}

export function emptyModel(): CardModel {
  return {
    schemaVersion: 2, title: '', status: 'todo', statusReason: null, blockerType: null,
    priority: 'none', members: [], labels: [], startAt: null, dueAt: null, coverColor: null,
    hoursMinutes: null, financial: { type: 'none', amount: 0, category: 'general', date: null },
    scope: null, test: null, updatedAt: null, locked: false, description: '',
    refs: [], decisions: [], checklists: [], extras: {},
  };
}
