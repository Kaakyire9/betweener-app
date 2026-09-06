type LiveRouteParam = string | string[] | null | undefined;

export type CircleLiveReturnTab = 'gatherings' | 'live' | 'overview' | 'pulse';

export type LiveReturnRouteParams = {
  returnCircleId?: LiveRouteParam;
  returnCircleTab?: LiveRouteParam;
};

export type SanitizedLiveReturnParams = {
  returnCircleId: string;
  returnCircleTab: CircleLiveReturnTab;
};

export type LiveExitDestination = '/live' | {
  pathname: '/circles/[id]';
  params: {
    id: string;
    tab: CircleLiveReturnTab;
  };
};

const RETURN_TABS: readonly CircleLiveReturnTab[] = [
  'gatherings',
  'live',
  'overview',
  'pulse',
];

const firstParam = (value: LiveRouteParam) => (
  Array.isArray(value) ? value[0] : value
);

export const createCircleLiveReturnParams = (
  circleId: string,
  returnCircleTab: CircleLiveReturnTab = 'live',
): SanitizedLiveReturnParams => ({
  returnCircleId: circleId.trim(),
  returnCircleTab,
});

export const getLiveReturnParams = (
  params?: LiveReturnRouteParams | null,
): Partial<SanitizedLiveReturnParams> => {
  const returnCircleId = firstParam(params?.returnCircleId)?.trim() ?? '';
  if (!returnCircleId) return {};

  const requestedTab = firstParam(params?.returnCircleTab)?.trim() ?? '';
  const returnCircleTab = RETURN_TABS.includes(requestedTab as CircleLiveReturnTab)
    ? requestedTab as CircleLiveReturnTab
    : 'live';

  return { returnCircleId, returnCircleTab };
};

export const getLiveExitDestination = (
  params?: LiveReturnRouteParams | null,
): LiveExitDestination => {
  const returnParams = getLiveReturnParams(params);
  if (!returnParams.returnCircleId || !returnParams.returnCircleTab) return '/live';

  return {
    pathname: '/circles/[id]',
    params: {
      id: returnParams.returnCircleId,
      tab: returnParams.returnCircleTab,
    },
  };
};

export const isReturningToCircle = (
  params?: LiveReturnRouteParams | null,
) => Boolean(getLiveReturnParams(params).returnCircleId);
