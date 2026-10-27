import type { BlockerType, CardStatus } from './card-status';

export type Rev = string; // bigint as string
export type Priority = string;

export interface CardRef { id: string; title: string; path: string }
export interface DecisionOption { key: string; text: string }
export interface DecisionAnswer { key: string; note: string | null; by: string; at: number }
export interface CardDecision {
  id: string;
  question: string;
  options: DecisionOption[];
  state: 'open' | 'answered';
  answer: DecisionAnswer | null;
}
export type ChecklistItemKind = 'task' | 'approval';
export interface ChecklistItemState {
  id: string; title: string; isDone: boolean; assignee: string | null;
  minutes: number; kind: ChecklistItemKind; rev: Rev;
}
export interface ChecklistState { id: string; title: string; rev: Rev; items: ChecklistItemState[] }
export interface Financial { type: string; amount: number; category: string; date: string | null }

export interface CardState {
  id: string; rev: Rev; updatedAt: number; archived: boolean; deleted: boolean;
  rodoPath: string | null;
  title: string; description: string;
  status: CardStatus; list: string; statusReason: string | null; blockerType: BlockerType | null;
  priority: Priority | null; coverColor: string | null;
  startAt: string | null; dueAt: string | null; hours: number | null;
  financial: Financial;
  scope: { allowed: string[]; forbidden: string[] };
  test: { adapter: string | null; command: string | null };
  members: string[]; labels: string[]; locked: boolean;
  refs: CardRef[]; decisions: CardDecision[]; checklists: ChecklistState[];
  simpleDoc: { path: string; hash: string; updatedAt: number } | null;
  fieldRevs: Record<string, Rev>;
}

export interface Tombstone { entity: string; cardId: string; key: string; seq: Rev }

export interface ChangesResponse {
  fromSeq: Rev; toSeq: Rev; hasMore: boolean; serverTimeMs: number;
  cards: CardState[]; tombstones: Tombstone[];
}

export interface BoardMetaList { id: string; title: string; workflowRole: 'START' | 'ACTIVE' | 'END' | null; position: string }
export interface MetaResponse {
  board: { id: string; title: string; syncSeq: Rev; archived: boolean; repoFingerprint: string | null; repoBrowseUrl: string | null };
  lists: BoardMetaList[];
  labels: { name: string; color: string }[];
  members: { username: string; name: string }[];
  capabilities: {
    formatVersions: number[]; cardStatuses: CardStatus[]; blockerTypes: BlockerType[];
    decisions: boolean; simpleDoc: boolean; approval: boolean;
  };
  limits: { pushOps: number; pushBytes: number; changesPage: number; simpleDocBytes: number; descriptionChars: number };
  serverTimeMs: number;
  minCliVersion: string;
}

export interface SetOps<T = string> { add: T[]; remove: T[] }
export interface RefsOps extends SetOps<{ title: string; path: string }> {
  retitle: { id: string; title: string }[];
}
export interface ChecklistItemOp {
  id?: string; tempId?: string; baseRev?: Rev;
  set?: Partial<Pick<ChecklistItemState, 'title' | 'isDone' | 'assignee' | 'minutes' | 'kind'>>;
  after?: string | null; delete?: boolean;
}
export interface ChecklistOp {
  id?: string; tempId?: string; baseRev?: Rev; title: string | null; order: number | null;
  items: ChecklistItemOp[];
}
export interface DecisionOp {
  id?: string; tempId?: string;
  set?: { question: string; options: DecisionOption[] };
  withdraw?: boolean;
}
export interface StatusGroup {
  status: CardStatus; list: string | null; statusReason: string | null; blockerType: BlockerType | null;
}

export interface PushOp {
  opId: string; kind: 'CREATE' | 'UPDATE' | 'ARCHIVE';
  cardId?: string; tempId?: string | null; baseRev: Rev; editedAt: number;
  rodoPath: string; formatVersion: 1 | 2;
  fields?: { status?: StatusGroup; [field: string]: unknown };
  members?: SetOps; labels?: SetOps; refs?: RefsOps;
  checklists?: ChecklistOp[]; decisions?: DecisionOp[];
  simpleDoc?: { path: string; hash: string; content: string; gitCommit?: string; gitBranch?: string };
}

export interface ValidationFinding { code: string; line: number | null; message: string }
export interface ValidationReport {
  cardId: string | null; path: string; errors: ValidationFinding[]; warnings: ValidationFinding[];
}

export interface PushRequest {
  deviceId: string; clientNowMs: number; clock: 'server' | 'local'; offsetMs: number;
  ackSeq: Rev; ops: PushOp[]; validation: ValidationReport[];
}

export type SyncErrorCode =
  | 'CARD_NOT_FOUND' | 'ARCHIVED' | 'LOCKED' | 'FORBIDDEN' | 'VALIDATION'
  | 'NO_LIST_FOR_STATUS' | 'UNKNOWN_LIST' | 'LIST_STATUS_MISMATCH' | 'STATUS_TRANSITION_INVALID'
  | 'UNKNOWN_MEMBER' | 'UNKNOWN_LABEL'
  | 'APPROVAL_REQUIRES_HUMAN' | 'DECISION_ANSWER_REQUIRES_HUMAN'
  | 'ITEM_DELETED_ON_SERVER' | 'DECISION_NOT_FOUND'
  | 'SIMPLE_DOC_TOO_LARGE' | 'SECRET_SUSPECTED'
  | 'REPOSITORY_MISMATCH' | 'RESYNC_REQUIRED' | 'BOARD_ARCHIVED' | 'PUSH_TOO_LARGE' | 'CLI_TOO_OLD'
  | 'DEVICE_TOKEN_INVALID' | 'DEVICE_REVOKED' | 'DEVICE_EXPIRED' | 'DEVICE_TOKEN_SCOPE' | 'BOARD_NOT_ALLOWED'
  | 'AUTHORIZATION_PENDING' | 'SLOW_DOWN' | 'EXPIRED_TOKEN' | 'ACCESS_DENIED' | 'CONNECT_CODE_INVALID';

export interface OpError { code: SyncErrorCode; field?: string; itemId?: string; message: string }
export interface OpResult {
  opId: string; status: 'APPLIED' | 'PARTIAL' | 'REJECTED' | 'NOOP';
  cardId?: string; idMap?: Record<string, string>;
  conflicts?: { field: string; winner: 'server' | 'local'; lostValue: unknown }[];
  errors: OpError[]; card?: CardState;
}
export interface PushResult { toSeq: Rev; serverTimeMs: number; results: OpResult[] }

export interface DeviceAuthorizeResponse {
  deviceCode: string; userCode: string; verificationUri: string; verificationUriComplete: string;
  expiresInSec: number; intervalSec: number;
}
export type DeviceScope = 'sync:read' | 'sync:write' | 'boards:create';
export interface DeviceTokenResponse {
  token: string; deviceId: string; expiresAt: string;
  user: { username: string; name: string }; scopes: DeviceScope[];
}
export interface ConnectResponse extends DeviceTokenResponse {
  board: { id: string; title: string; workspaceId: string; projectId: string };
}
export interface DeviceView {
  id: string; name: string; platform: string; cliVersion: string; tokenPrefix: string;
  scopes: DeviceScope[]; boardIds: string[];
  lastSeenAt: string | null; expiresAt: string; createdAt: string; revokedAt: string | null;
  bindings: { boardId: string; boardTitle: string; folderLabel: string; projectSlug: string; lastSyncAt: string | null; lastPulledSeq: Rev }[];
}
