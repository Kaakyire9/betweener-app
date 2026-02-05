const asBool = (value: string | undefined, defaultValue: boolean) => {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
};

export const AUTH_V2_ENABLED = asBool(process.env.EXPO_PUBLIC_AUTH_V2, true);
