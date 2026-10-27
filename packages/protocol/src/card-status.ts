export const CARD_STATUSES = ['todo', 'in_progress', 'blocked', 'cancelled', 'done'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  todo: 'برنامه‌ریزی‌شده',
  in_progress: 'در حال انجام',
  blocked: 'گیر کرده',
  cancelled: 'لغوشده',
  done: 'انجام‌شده',
};

export const BLOCKER_TYPES = [
  'decision',
  'technical',
  'environment',
  'external',
  'permission',
  'test',
  'requirement',
] as const;
export type BlockerType = (typeof BLOCKER_TYPES)[number];

export const BLOCKER_TYPE_LABELS: Record<BlockerType, string> = {
  decision: 'تصمیم',
  technical: 'فنی',
  environment: 'محیط',
  external: 'بیرونی',
  permission: 'دسترسی',
  test: 'تست',
  requirement: 'نیازمندی',
};

export type CardHoldState = 'NONE' | 'BLOCKED' | 'CANCELLED';
export type ListWorkflowRoleValue = 'START' | 'ACTIVE' | 'END';

/** The only place a card status is computed (cycle 004 R1). Order matters. */
export function deriveCardStatus(input: {
  holdState: CardHoldState;
  completedAt: Date | string | number | null | undefined;
  listWorkflowRole: ListWorkflowRoleValue | null | undefined;
}): CardStatus {
  if (input.holdState === 'CANCELLED') return 'cancelled';
  if (input.completedAt) return 'done';
  if (input.holdState === 'BLOCKED') return 'blocked';
  if (input.listWorkflowRole === 'START') return 'todo';
  return 'in_progress';
}
