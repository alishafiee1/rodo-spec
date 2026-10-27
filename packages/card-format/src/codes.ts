import type { Finding } from './model';

export type Severity = 'E' | 'W';
type Args = Record<string, any>;
interface CodeDef { sev: Severity; msg: (a: Args) => string }

const STATUS_LIST = 'status must be todo, in_progress, blocked, cancelled or done';
const BLOCKER_LIST = 'decision, technical, environment, external, permission, test, requirement';
const e = (msg: (a: Args) => string): CodeDef => ({ sev: 'E', msg });
const w = (msg: (a: Args) => string): CodeDef => ({ sev: 'W', msg });

/** Codes the validator can emit. Messages are byte-identical to ref/11 §8. */
export const CODES = {
  ENCODING_INVALID: e(() => 'ENCODING_INVALID: file is not UTF-8'),
  FRONTMATTER_MISSING: e(() => 'FRONTMATTER_MISSING: line 1 must be ---'),
  FRONTMATTER_UNCLOSED: e(() => 'FRONTMATTER_UNCLOSED: add a closing --- line'),
  YAML_INVALID: e((a) => `YAML_INVALID: line ${a.n}: ${a.detail}`),
  SCHEMA_VERSION_MISSING: e(() => 'SCHEMA_VERSION_MISSING: schemaVersion must be 1 or 2'),
  SCHEMA_VERSION_INVALID: e(() => 'SCHEMA_VERSION_INVALID: schemaVersion must be 1 or 2'),
  BOARD_ID_MISSING: e(() => 'BOARD_ID_MISSING: add boardId (schemaVersion 1 only) or use schemaVersion: 2'),
  BOARD_MISMATCH: e((a) => `BOARD_MISMATCH: boardId is not the board of this project (${a.boardId})`),
  TITLE_MISSING: e(() => 'TITLE_MISSING: title must be 1-200 characters'),
  TITLE_INVALID: e(() => 'TITLE_INVALID: title must be 1-200 characters'),
  STATUS_MISSING: e(() => `STATUS_MISSING: ${STATUS_LIST}`),
  STATUS_INVALID: e((a) => `STATUS_INVALID: ${STATUS_LIST} (found "${a.value}")`),
  STATUS_NOT_SUPPORTED: e((a) => `STATUS_NOT_SUPPORTED: this RODO server does not know status ${a.value} yet; use todo, in_progress or done for now`),
  ID_INVALID: e(() => 'ID_INVALID: do not write id; rodo sync writes it'),
  TEMP_ID_INVALID: e(() => 'TEMP_ID_INVALID: do not write tempId; rodo sync writes it'),
  STATUS_REASON_INVALID: e(() => 'STATUS_REASON_INVALID: statusReason must be one line of 1-500 characters'),
  BLOCKER_TYPE_INVALID: e(() => 'BLOCKER_TYPE_INVALID: blockerType must be decision, technical, environment, external, permission, test or requirement'),
  PRIORITY_INVALID: e(() => 'PRIORITY_INVALID: priority must be none, low, medium, high or urgent'),
  MEMBERS_INVALID: e(() => 'MEMBERS_INVALID: members must be a list like [ali, sara]'),
  LABELS_INVALID: e(() => 'LABELS_INVALID: labels must be a list like [bug, ui]'),
  DATE_INVALID: e((a) => `DATE_INVALID: ${a.key} must be YYYY-MM-DD`),
  DATE_RANGE: e(() => 'DATE_RANGE: startAt is after dueAt'),
  COVER_COLOR_INVALID: e(() => 'COVER_COLOR_INVALID: use purple, orange, green, sky, yellow or pink'),
  HOURS_INVALID: e((a) => `invalid hours: "${a.value}" (use H:MM with two-digit minutes)`),
  CARD_HOURS_WITH_ITEMS: e(() => 'CARD_HOURS_WITH_ITEMS: remove front-matter hours; put hours on items'),
  FINANCIAL_INVALID: e((a) => `FINANCIAL_INVALID: ${a.detail}`),
  FINANCIAL_AMOUNT_REQUIRED: e(() => 'FINANCIAL_AMOUNT_REQUIRED: set financial.amount to a whole number above 0'),
  FINANCIAL_CARD_SINGLE_MEMBER: e(() => 'FINANCIAL_CARD_SINGLE_MEMBER: keep exactly one name in members'),
  SCOPE_INVALID: e(() => 'SCOPE_INVALID: scope must have allowed/forbidden lists of up to 20 short items'),
  TEST_INVALID: e(() => 'TEST_INVALID: test needs adapter (web, api, cli, mobile, iot, other) and command (max 500 chars)'),
  UNKNOWN_KEY: e((a) => `UNKNOWN_KEY: "${a.key}" is not a card field (use x-<name> for local notes)`),
  OLD_KEY: e((a) => `OLD_KEY: "${a.key}" is no longer used (${a.hint})`),
  DESCRIPTION_TOO_LONG: e((a) => `DESCRIPTION_TOO_LONG: description is ${a.n} characters (max 8000)`),
  SECTION_ORDER: e(() => 'SECTION_ORDER: write description, then ## Refs, then ## Decision sections, then ## Checklist sections'),
  REF_LINE_INVALID: e((a) => `REF_LINE_INVALID: line ${a.n}: write - [title](/path)`),
  REF_PATH_INVALID: e((a) => `REF_PATH_INVALID: ${a.path}`),
  REF_TITLE_INVALID: e((a) => `REF_TITLE_INVALID: line ${a.n}: title must be 1-200 characters`),
  REF_DUPLICATE: e((a) => `REF_DUPLICATE: ${a.path}`),
  REF_LIMIT_REACHED: e(() => 'REF_LIMIT_REACHED: at most 20 refs'),
  REF_NOT_FOUND: e((a) => `ref not found: ${a.path}`),
  DECISION_TITLE_INVALID: e((a) => `DECISION_TITLE_INVALID: line ${a.n}: the question must be 1-300 characters`),
  DECISION_LINE_INVALID: e((a) => `DECISION_LINE_INVALID: line ${a.n}: write options as "- A: text"`),
  DECISION_OPTION_INVALID: e((a) => `DECISION_OPTION_INVALID: line ${a.n}: use keys A-F once each, 1-200 characters`),
  DECISION_OPTIONS_COUNT: e(() => 'DECISION_OPTIONS_COUNT: a decision needs 2 to 6 options'),
  DECISION_LIMIT_REACHED: e(() => 'DECISION_LIMIT_REACHED: at most 5 decisions per card'),
  DECISION_ANSWER_REQUIRES_HUMAN: e((a) => `DECISION_ANSWER_REQUIRES_HUMAN: only a person can answer "${a.question}" in the web app; remove the Answer line`),
  CHECKLIST_TITLE_INVALID: e((a) => `CHECKLIST_TITLE_INVALID: line ${a.n}: title must be 1-120 characters`),
  ITEM_LINE_INVALID: e((a) => `ITEM_LINE_INVALID: line ${a.n}: write - [ ] title`),
  ITEM_TITLE_INVALID: e((a) => `ITEM_TITLE_INVALID: line ${a.n}: title must be 1-200 characters`),
  APPROVAL_ITEM_DUPLICATE: e(() => 'APPROVAL_ITEM_DUPLICATE: keep only one [approval] item'),
  APPROVAL_ITEM_INVALID: e(() => 'APPROVAL_ITEM_INVALID: no @user or [hours] on the [approval] item'),
  APPROVAL_REQUIRES_HUMAN: e((a) => `APPROVAL_REQUIRES_HUMAN: only a person can tick "${a.title}" in the web app`),
  ID_DUPLICATE: e((a) => `ID_DUPLICATE: rodo id ${a.id} appears twice in this file`),
  CARD_ID_DUPLICATE: e((a) => `duplicate id: this file is a copy of ${a.path}; delete its id line and rodo: comments`),
  SECRET_SUSPECTED: e((a) => `SECRET_SUSPECTED: line ${a.n} looks like a secret (${a.kind}); remove it — secrets never go into rodo files`),
  SECRET_POSSIBLE: w((a) => `SECRET_POSSIBLE: line ${a.n} may contain a secret inside code (${a.kind}); check it — only an example value is fine`),
  UNKNOWN_LIST: e((a) => `UNKNOWN_LIST: "${a.list}"`),
  LIST_STATUS_MISMATCH: e((a) => `LIST_STATUS_MISMATCH: list "${a.list}" does not fit status ${a.status}`),
  UNKNOWN_MEMBER: e((a) => `UNKNOWN_MEMBER: ${a.username}`),
  UNKNOWN_LABEL: e((a) => `UNKNOWN_LABEL: ${a.label}`),
  FILE_EXT_CASE: w(() => 'FILE_EXT_CASE: rename to *.rodo.md'),
  LOCKED_EDITED: w(() => 'LOCKED_EDITED: locked is set by the server; local change ignored'),
  UPDATED_AT_EDITED: w(() => 'UPDATED_AT_EDITED: updatedAt is written by rodo sync; local change ignored'),
  BLOCKER_TYPE_MISSING: w(() => `BLOCKER_TYPE_MISSING: add blockerType (${BLOCKER_LIST})`),
  BLOCKER_TYPE_WITHOUT_BLOCKED: w(() => 'BLOCKER_TYPE_WITHOUT_BLOCKED: blockerType is only used when status is blocked'),
  DECISION_ANSWERED_READONLY: w((a) => `DECISION_ANSWERED_READONLY: "${a.question}" is answered; local changes ignored`),
  WORKFLOW_INVALID: w((a) => `WORKFLOW_INVALID: workflow must be quick, standard or major (found "${a.value}"); ignored`),
  DESIGN_MISSING: w(() => 'DESIGN_MISSING: workflow is major but the cycle has no design.md (recommended, not required)'),
  REF_MISSING_LOCAL: w((a) => `ref not found on this device: ${a.path}`),
  APPROVAL_HASH_LEGACY: w(() => 'APPROVAL_HASH_LEGACY: use [approval] without a hash'),
  CYCLE_FOLDER_NAME: w(() => 'CYCLE_FOLDER_NAME: name the cycle folder NNN-slug (for example 004-order-cancel)'),
  CYCLE_CARD_NAME: w(() => 'CYCLE_CARD_NAME: a cycle card must be cycles/NNN-slug/card.rodo.md'),
  CYCLE_SIMPLE_MISSING: w(() => 'CYCLE_SIMPLE_MISSING: the cycle folder has no simple.md'),
  CYCLE_REFS_MISSING: w(() => 'CYCLE_REFS_MISSING: add a ## Refs section that links the cycle simple.md'),
  PROGRESS_NOTES_MISSING: w(() => 'PROGRESS_NOTES_MISSING: add a ## Progress notes section'),
  BLOCKER_REASON_MISSING: w(() => 'BLOCKER_REASON_MISSING: a blocked card needs statusReason'),
  CANCEL_REASON_MISSING: w(() => 'CANCEL_REASON_MISSING: a cancelled card needs statusReason'),
  STATUS_REASON_WITHOUT_HOLD: w(() => 'STATUS_REASON_WITHOUT_HOLD: statusReason is only used when status is blocked or cancelled'),
  STATUS_REASON_FROM_NOTES: w(() => 'STATUS_REASON_FROM_NOTES: the reason was read from Progress notes; rodo sync will add statusReason'),
  CYCLE_CANCELLED_NOT_IN_MAP: w(() => 'CYCLE_CANCELLED_NOT_IN_MAP: list this cancelled cycle under ## لغوشده (or ## Cancelled) in MAP.md'),
  CYCLE_DONE_NOT_IN_MAP: w(() => 'CYCLE_DONE_NOT_IN_MAP: list this finished cycle under ## انجام‌شده (or ## Done) in MAP.md'),
  SCOPE_MISSING: w(() => 'SCOPE_MISSING: add scope (allowed/forbidden) to this cycle card'),
  REQUEST_GOAL_MISSING: w(() => 'REQUEST_GOAL_MISSING: a new request card needs a ## Goal heading'),
  BOARD_ID_PLACEHOLDER: w(() => 'BOARD_ID_PLACEHOLDER: boardId is a placeholder; run rodo init to bind this project'),
  SCHEMA_V1: w(() => 'SCHEMA_V1: schemaVersion 1 is old; rodo sync will upgrade the file to 2'),
} satisfies Record<string, CodeDef>;

export type CodeName = keyof typeof CODES;

/** Codes written by sync/server code, not by validateCard (ref/11 §8). */
export const SYNC_CODES = {
  LOCKED: (a: Args) => `card is locked by ${a.name}`,
  // cycle 008: no longer raised by validateCard; the server still returns it to a caller who cannot write the board
  NO_LIST_FOR_STATUS: () => 'NO_LIST_FOR_STATUS: the board has no list for this status and you cannot add one',
  STATUS_TRANSITION_INVALID: (a: Args) => `STATUS_TRANSITION_INVALID: cannot go from ${a.from} to ${a.to}; set in_progress first`,
  ARCHIVED: () => 'ARCHIVED: this card was archived on the board; the file moved to .rodo/trash/',
  FORBIDDEN: () => 'FORBIDDEN: you cannot change this board (ask the board owner)',
  VALIDATION: (a: Args) => `VALIDATION: ${a.detail}`,
  DECISION_ANSWERED_KEPT: (a: Args) => `DECISION_ANSWERED_KEPT: "${a.question}" is answered; it stays on the card`,
  REPO_SHALLOW: () => 'REPO_SHALLOW: this is a shallow git clone; the repository check was skipped',
  SIMPLE_DOC_BRANCH_CHANGED: (a: Args) => `SIMPLE_DOC_BRANCH_CHANGED: simple.md of ${a.cycle} was last pushed from branch ${a.old}, now from ${a.new}; the board shows the newest`,
  CONFLICT_RESOLVED: (a: Args) => `CONFLICT_RESOLVED: ${a.field} changed on the board and here; kept ${a.winner} value; a copy of your file is in .rodo/conflicts/`,
  ITEM_DELETED_ON_SERVER: (a: Args) => `ITEM_DELETED_ON_SERVER: "${a.title}" was deleted on the board; your edit is in the web history`,
  SERVER_CHANGED_WHILE_INVALID: (a: Args) => `SERVER_CHANGED_WHILE_INVALID: the board changed this card; its version is in .rodo/conflicts/${a.id}.server.rodo.md`,
  ARCHIVE_CONFIRM_REQUIRED: (a: Args) => `ARCHIVE_CONFIRM_REQUIRED: ${a.n} card files were deleted; run rodo sync --confirm-archive to archive them on the board`,
  OFFLINE: () => 'OFFLINE: server not reachable; validated only, nothing lost',
};

export function finding(code: CodeName, line: number | null, args: Args = {}): Finding {
  return { code, line, message: CODES[code].msg(args) };
}

export const severityOf = (code: string): Severity | undefined =>
  (CODES as Record<string, CodeDef>)[code]?.sev;
