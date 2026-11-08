import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectProduct } from '../application/product-coordinator';
import { loadRecentCallHistory } from '../domain/call-history';
import type { ConnectSession } from '../domain/connect';
export function useRecentCalls(product: ConnectProduct | null) {
  const owner = useMemo(() => ({ active: false, sequence: 0, limit: 20, pending: false }), [product]);
  const [state, setState] = useState<{ owner: typeof owner | null; rows: { call: ConnectSession; name: string }[]; busy: boolean; error: string | null }>({ owner: null, rows: [], busy: false, error: null });
  useEffect(() => { owner.active = true; return () => { owner.active = false; ++owner.sequence; }; }, [owner]);
  const read = useCallback(async (more: boolean) => {
    if (!product || !owner.active || (more && owner.pending)) return;
    const sequence = ++owner.sequence; owner.pending = true; owner.limit = more ? Math.min(100, owner.limit + 20) : 20;
    const current = () => owner.active && owner.sequence === sequence;
    setState(value => ({ owner, rows: value.owner === owner ? value.rows : [], busy: true, error: null }));
    try {
      const rows = await loadRecentCallHistory({ api: product.services.api, selfProfileId: product.selfProfileId,
        limit: owner.limit, peer: product.services.peer, current });
      if (current() && rows) setState({ owner, rows, busy: false, error: null });
    } catch { if (current()) setState(value => ({ ...value, busy: false, error: 'Call history is unavailable. Try refreshing.' })); }
    finally { if (current()) owner.pending = false; }
  }, [owner, product]);
  const refresh = useCallback(() => read(false), [read]), loadMore = useCallback(() => read(true), [read]);
  const visible = state.owner === owner ? state : { rows: [], busy: false, error: null };
  return { ...visible, refresh, loadMore, canLoadMore: visible.rows.length >= owner.limit && owner.limit < 100 };
}
