const DEV_ENABLED = typeof __DEV__ !== "undefined" && __DEV__;
const EXPLICIT_INTERNAL_TOOLS = String(process.env.EXPO_PUBLIC_ENABLE_INTERNAL_TOOLS || "").toLowerCase() === "true";
const RAW_ADMIN_EMAILS = String(process.env.EXPO_PUBLIC_ADMIN_EMAILS || "");

const ADMIN_EMAILS = RAW_ADMIN_EMAILS.split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

export const INTERNAL_TOOLS_ENABLED = DEV_ENABLED || EXPLICIT_INTERNAL_TOOLS;

export const canAccessInternalTools = () => INTERNAL_TOOLS_ENABLED;

export const canAccessAdminTools = (email?: string | null) => {
  if (!INTERNAL_TOOLS_ENABLED) return false;
  if (!email) return false;
  return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
};
