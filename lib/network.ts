export const isLikelyNetworkError = (error: unknown) => {
  const msg = String((error as any)?.message || error || "");
  const lower = msg.toLowerCase();

  // React Native fetch/network patterns
  if (lower.includes("network request failed")) return true;
  if (lower.includes("failed to fetch")) return true;
  if (lower.includes("load failed")) return true;
  if (lower.includes("fetch_failed")) return true;

  // Timeouts / connectivity
  if (lower.includes("timeout")) return true;
  if (lower.includes("econn")) return true;
  if (lower.includes("enet")) return true;

  return false;
};

