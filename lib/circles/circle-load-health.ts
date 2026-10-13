export type CircleQueryFailureInput = {
  key: string;
  label: string;
  error?: { message?: string | null } | null;
};

export type CircleQueryFailure = {
  key: string;
  label: string;
  message: string;
};

export const collectCircleQueryFailures = (
  queries: CircleQueryFailureInput[],
): CircleQueryFailure[] => queries.flatMap(({ key, label, error }) => {
  if (!error) return [];
  return [{
    key,
    label,
    message: String(error.message || 'Unknown query failure'),
  }];
});

export const createCircleQueryFailureError = (failures: CircleQueryFailure[]) => {
  const labels = [...new Set(failures.map((failure) => failure.label))];
  return new Error(`Could not load ${labels.join(', ')}.`);
};

export const getCircleProfileBindingError = (
  profileId: string | null | undefined,
  error?: { message?: string | null } | null,
) => {
  if (error) return 'We could not connect Circles to this account. Please retry.';
  if (!profileId) return 'Finish setting up your profile before opening Circles.';
  return null;
};
