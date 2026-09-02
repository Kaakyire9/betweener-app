export const CIRCLE_ENTRY_REASONS = [
  'Meet people like me',
  'Make new friends',
  'Learn and share',
  'Attend gatherings',
  'Find meaningful connection',
] as const;

export const CIRCLE_ENTRY_PRIORITIES = [
  'Shared values',
  'Relationship goals',
  'Culture and roots',
  'Lifestyle',
  'Location',
  'Fresh conversations',
] as const;

export const toggleCircleEntryChoice = (current: string[], choice: string, limit = 3) => {
  if (current.includes(choice)) return current.filter((item) => item !== choice);
  if (current.length >= limit) return current;
  return [...current, choice];
};
