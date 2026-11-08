export const PROFILE_EDUCATION_OPTIONS = [
  'Secondary / high school',
  'Vocational or trade school',
  'Some college or university',
  'Undergraduate student',
  "Bachelor's degree",
  'Postgraduate student',
  "Master's degree",
  'Doctorate',
  'Other',
  'Prefer not to say',
] as const;

export const isStandardProfileEducation = (value?: string | null) =>
  PROFILE_EDUCATION_OPTIONS.some((option) => option === value);
