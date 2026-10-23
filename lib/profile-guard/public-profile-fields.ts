import { moderatePublicProfileText } from './index.ts';

export const PUBLIC_PROFILE_GUARD_MESSAGE =
  "Contact details, external links and promotional content can't appear on your public profile.";

export const PUBLIC_PROFILE_TEXT_FIELDS = [
  'full_name',
  'username',
  'bio',
  'occupation',
  'education',
  'looking_for',
  'tribe',
  'roots',
  'roots_note',
  'height',
  'exercise_frequency',
  'smoking',
  'drinking',
  'has_children',
  'wants_children',
  'personality_type',
  'love_language',
  'living_situation',
  'pets',
  'languages_spoken',
  'future_ghana_plans',
] as const;

export type PublicProfileTextField = (typeof PUBLIC_PROFILE_TEXT_FIELDS)[number];

const guardedFields = new Set<string>(PUBLIC_PROFILE_TEXT_FIELDS);

export const isPublicProfileTextField = (field: string): field is PublicProfileTextField =>
  guardedFields.has(field);

export const publicProfileValueToText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').join(' ');
  }
  return '';
};

export const getPublicProfileFieldError = (field: string, value: unknown) => {
  if (!isPublicProfileTextField(field)) return null;
  const text = publicProfileValueToText(value);
  if (!text.trim()) return null;
  return moderatePublicProfileText(text).allowed ? null : PUBLIC_PROFILE_GUARD_MESSAGE;
};

export const validatePublicProfileFields = (values: Record<string, unknown>) => {
  const fieldErrors: Partial<Record<PublicProfileTextField, string>> = {};
  const combinedText: string[] = [];

  for (const field of PUBLIC_PROFILE_TEXT_FIELDS) {
    const text = publicProfileValueToText(values[field]);
    if (text.trim()) combinedText.push(text);
    const error = getPublicProfileFieldError(field, values[field]);
    if (error) fieldErrors[field] = error;
  }

  const aggregateError = combinedText.length > 0
    && !moderatePublicProfileText(combinedText.join('\n')).allowed
    ? PUBLIC_PROFILE_GUARD_MESSAGE
    : null;

  return {
    allowed: Object.keys(fieldErrors).length === 0 && !aggregateError,
    fieldErrors,
    aggregateError,
  };
};

export const validatePublicProfilePrompt = (input: {
  title?: string | null;
  answer?: string | null;
  hint?: string | null;
  options?: unknown[] | null;
}) => {
  const text = [
    input.title,
    input.answer,
    input.hint,
    ...(Array.isArray(input.options) ? input.options : []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');

  return {
    allowed: !text || moderatePublicProfileText(text).allowed,
    message: PUBLIC_PROFILE_GUARD_MESSAGE,
  };
};
