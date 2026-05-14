export const isLikelyNetworkError = (error: unknown) => {
  const parts = [
    (error as any)?.message,
    (error as any)?.name,
    (error as any)?.code,
    (error as any)?.status,
    (error as any)?.error_description,
    (error as any)?.details,
    error,
  ];
  const msg = parts
    .map((part) => {
      if (!part) return "";
      if (typeof part === "string") return part;
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    })
    .join(" ");
  const lower = msg.toLowerCase();

  // React Native fetch/network patterns
  if (lower.includes("network request failed")) return true;
  if (lower.includes("network error")) return true;
  if (lower.includes("networkerror")) return true;
  if (lower.includes("failed to fetch")) return true;
  if (lower.includes("load failed")) return true;
  if (lower.includes("fetch_failed")) return true;
  if (lower.includes("typeerror: network")) return true;
  if (lower.includes("storageapierror") && lower.includes("network")) return true;

  // Timeouts / connectivity
  if (lower.includes("timeout")) return true;
  if (lower.includes("econn")) return true;
  if (lower.includes("enet")) return true;
  if (lower.includes("offline")) return true;

  return false;
};
