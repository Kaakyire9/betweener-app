import { EconomyError } from '@/lib/economy/types';
import type { EconomyActionCode, EconomyRule, MembershipTier } from '@/lib/economy/types';

export function selectEconomyRule(
  rules: readonly EconomyRule[],
  input: {
    environment: EconomyRule['environment'];
    actionCode: EconomyActionCode;
    membershipTier: MembershipTier;
  },
): EconomyRule {
  const rule = rules
    .filter((candidate) =>
      candidate.environment === input.environment &&
      candidate.actionCode === input.actionCode &&
      candidate.membershipTier === input.membershipTier)
    .sort((left, right) => right.version - left.version)[0];

  if (!rule) throw new EconomyError('ACTION_NOT_FOUND', 'This action is not available.');
  return rule;
}
