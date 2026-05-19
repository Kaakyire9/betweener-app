export type PremiumPlan = 'FREE' | 'SILVER' | 'GOLD' | string | null | undefined;

export type CircleAccessProfile = {
  id?: string | null;
  user_id?: string | null;
  is_internal_admin?: boolean | null;
  admin?: boolean | null;
};

export type CircleAccessEntitlements = {
  plan?: PremiumPlan;
  is_active?: boolean | null;
  isActive?: boolean | null;
};

export type CircleRoleLike = {
  created_by_profile_id?: string | null;
  created_by_user_id?: string | null;
  role?: string | null;
};

const normalizePlan = (plan: PremiumPlan) => String(plan ?? 'FREE').toUpperCase();

export const isGoldPlan = (entitlements?: CircleAccessEntitlements | null) => {
  if (!entitlements) return false;
  const active = entitlements.is_active ?? entitlements.isActive ?? true;
  return active !== false && normalizePlan(entitlements.plan) === 'GOLD';
};

export const isAdminProfile = (profile?: CircleAccessProfile | null) =>
  profile?.is_internal_admin === true || profile?.admin === true;

export const canCreateCircle = (
  entitlements?: CircleAccessEntitlements | null,
  profile?: CircleAccessProfile | null,
) => isAdminProfile(profile) || isGoldPlan(entitlements);

export const canCreateGathering = canCreateCircle;

export const canModerateCircle = (
  circle?: CircleRoleLike | null,
  profile?: CircleAccessProfile | null,
  membership?: CircleRoleLike | null,
) => {
  if (isAdminProfile(profile)) return true;
  if (!profile?.id && !profile?.user_id) return false;
  if (circle?.created_by_profile_id && circle.created_by_profile_id === profile.id) return true;
  if (circle?.created_by_user_id && circle.created_by_user_id === profile.user_id) return true;
  const role = String(membership?.role ?? '').toLowerCase();
  return ['admin', 'host', 'moderator', 'leader', 'matchmaker'].includes(role);
};

export const canApproveCircle = (_user?: unknown, profile?: CircleAccessProfile | null) =>
  isAdminProfile(profile);

export const getCircleCreationLimit = (
  entitlements?: CircleAccessEntitlements | null,
  profile?: CircleAccessProfile | null,
) => {
  if (isAdminProfile(profile)) return Number.POSITIVE_INFINITY;
  return isGoldPlan(entitlements) ? 3 : 0;
};

export const getGatheringCreationLimit = (
  entitlements?: CircleAccessEntitlements | null,
  profile?: CircleAccessProfile | null,
) => {
  if (isAdminProfile(profile)) return Number.POSITIVE_INFINITY;
  return isGoldPlan(entitlements) ? 5 : 0;
};
