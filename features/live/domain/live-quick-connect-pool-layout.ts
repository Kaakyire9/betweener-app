export const LIVE_QUICK_CONNECT_POOL_PAGE_SIZE = 4;

export type LiveQuickConnectPoolPage<T> = {
  page: number;
  pageCount: number;
  members: readonly T[];
  remainingCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export const paginateLiveQuickConnectPool = <T>(
  members: readonly T[],
  requestedPage: number,
): LiveQuickConnectPoolPage<T> => {
  const pageCount = Math.max(1, Math.ceil(members.length / LIVE_QUICK_CONNECT_POOL_PAGE_SIZE));
  const page = Math.min(Math.max(0, Math.trunc(requestedPage)), pageCount - 1);
  const start = page * LIVE_QUICK_CONNECT_POOL_PAGE_SIZE;
  const visibleMembers = members.slice(start, start + LIVE_QUICK_CONNECT_POOL_PAGE_SIZE);

  return {
    page,
    pageCount,
    members: visibleMembers,
    remainingCount: Math.max(0, members.length - (start + visibleMembers.length)),
    hasPrevious: page > 0,
    hasNext: page < pageCount - 1,
  };
};
