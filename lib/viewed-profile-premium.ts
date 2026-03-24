import type { UserProfile } from '@/types/user-profile';

export const getViewedProfilePremiumCopy = (name?: string | null) => {
  const firstName = (name || '').trim().split(/\s+/)[0] || 'this person';

  return {
    aboutEmpty: `${firstName} has kept this part light so far. Lead with a thoughtful question.`,
    lifestyleEmpty: 'Lifestyle details are still private, but the essentials will show up here over time.',
    promptsEmpty: 'No prompt answers yet. A specific opener will work better than a generic hello.',
    valuesEmpty: 'Intentions have not been spelled out yet. Let curiosity do some work here.',
    askAnything: 'Start with something observant and personal. Specificity reads better than speed.',
    basicsEmpty: 'Key details will appear here once they choose to share more.',
  };
};

export const getViewedProfileTrustChips = (profile: UserProfile) => {
  const chips: string[] = [];
  const verificationLevel = profile.verificationLevel ?? (profile.verified ? 1 : 0);

  if (verificationLevel >= 2) chips.push('ID verified');
  else if (verificationLevel >= 1) chips.push('Phone verified');

  if (profile.profileVideo || profile.profileVideoPath) chips.push('Intro video');
  if ((profile.interests || []).filter((item) => item?.name).length >= 3) chips.push('Shared interests visible');
  if ((profile.lookingFor || '').trim().length >= 10) chips.push('Intent shared');
  if ((profile.bio || '').trim().length >= 40) chips.push('Detailed profile');

  return chips.slice(0, 3);
};
