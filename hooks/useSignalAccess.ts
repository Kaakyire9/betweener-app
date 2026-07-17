import { getSignalAccess, type SignalAccess } from "@/lib/signal/signal-api";
import { useCallback, useEffect, useState } from "react";

const EMPTY_ACCESS: SignalAccess = {
  plan: "FREE",
  limit: 0,
  used: 0,
  remaining: 0,
  can_send: false,
};

export default function useSignalAccess(enabled = true) {
  const [access, setAccess] = useState<SignalAccess>(EMPTY_ACCESS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return EMPTY_ACCESS;
    setLoading(true);
    setError(null);
    try {
      const next = await getSignalAccess();
      setAccess(next);
      return next;
    } catch (err) {
      const normalized = err instanceof Error ? err : new Error("Unable to load Signal access.");
      setError(normalized);
      return EMPTY_ACCESS;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { access, loading, error, refresh };
}
