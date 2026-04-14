export type UserFacingProfileNameRow = {
  full_name?: string | null;
  account_state?: string | null;
  deleted_at?: string | null;
};

export const LEFT_BETWEENER_LABEL = "Left Betweener";

export const hasLeftBetweener = (profileRow?: UserFacingProfileNameRow | null) =>
  profileRow?.account_state === "deleted" || Boolean(profileRow?.deleted_at);

export const getUserFacingDisplayName = (
  profileRow?: UserFacingProfileNameRow | null,
  fallback = "Someone",
) => {
  const fullName = String(profileRow?.full_name || "").trim();
  if (fullName) return fullName;
  if (hasLeftBetweener(profileRow)) return LEFT_BETWEENER_LABEL;
  return fallback;
};

export const getSafeRemoteImageUri = (value?: string | null) => {
  const uri = String(value || "").trim();
  return uri.length > 0 ? uri : null;
};
