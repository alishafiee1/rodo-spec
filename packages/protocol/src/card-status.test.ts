import { describe, expect, it } from 'vitest';
import { deriveCardStatus, type CardHoldState, type ListWorkflowRoleValue } from './card-status';

const holds: CardHoldState[] = ['NONE', 'BLOCKED', 'CANCELLED'];
const roles: ListWorkflowRoleValue[] = ['START', 'ACTIVE', 'END'];

describe('deriveCardStatus', () => {
  for (const holdState of holds)
    for (const completedAt of [null, new Date()])
      for (const listWorkflowRole of roles) {
        it(`${holdState} completed=${!!completedAt} ${listWorkflowRole}`, () => {
          const expected =
            holdState === 'CANCELLED' ? 'cancelled'
            : completedAt ? 'done'
            : holdState === 'BLOCKED' ? 'blocked'
            : listWorkflowRole === 'START' ? 'todo'
            : 'in_progress';
          expect(deriveCardStatus({ holdState, completedAt, listWorkflowRole })).toBe(expected);
        });
      }
});
