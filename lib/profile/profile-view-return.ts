export type ProfileViewReturnParams = Record<string, string | string[] | undefined>;

const getFirstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export const getProfileViewReturnSource = (params: ProfileViewReturnParams) =>
  getFirstParam(params.source).trim().toLowerCase();

export const getProfileViewReturnCircleId = (params: ProfileViewReturnParams) => {
  const source = getProfileViewReturnSource(params);
  const circleId = getFirstParam(params.returnCircleId).trim();

  return ['circle', 'circle_people', 'circle_discover'].includes(source) && circleId ? circleId : null;
};

export const getProfileViewContextCircleId = (params: ProfileViewReturnParams) => {
  const contextCircleId = getFirstParam(params.contextCircleId).trim();
  if (contextCircleId) return contextCircleId;

  const source = getProfileViewReturnSource(params);
  const returnCircleId = getFirstParam(params.returnCircleId).trim();
  return ['circle', 'circle_discover'].includes(source) && returnCircleId
    ? returnCircleId
    : null;
};

export const shouldReturnToCirclesHome = (params: ProfileViewReturnParams) =>
  getProfileViewReturnSource(params) === 'circles_home';

export const shouldReturnToVibes = (params: ProfileViewReturnParams) =>
  getProfileViewReturnSource(params) === 'vibes';
