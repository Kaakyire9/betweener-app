export type ProfileViewReturnParams = Record<string, string | string[] | undefined>;

const getFirstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export const getProfileViewReturnCircleId = (params: ProfileViewReturnParams) => {
  const source = getFirstParam(params.source).trim().toLowerCase();
  const circleId = getFirstParam(params.returnCircleId).trim();

  return source === 'circle' && circleId ? circleId : null;
};
