export type ProfileViewReturnParams = Record<string, string | string[] | undefined>;

const getFirstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export const getProfileViewReturnSource = (params: ProfileViewReturnParams) =>
  getFirstParam(params.source).trim().toLowerCase();

export const getProfileViewReturnCircleId = (params: ProfileViewReturnParams) => {
  const source = getProfileViewReturnSource(params);
  const circleId = getFirstParam(params.returnCircleId).trim();

  return source === 'circle' && circleId ? circleId : null;
};

export const shouldReturnToCirclesHome = (params: ProfileViewReturnParams) =>
  getProfileViewReturnSource(params) === 'circles_home';
