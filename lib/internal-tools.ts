const DEV_ENABLED = typeof __DEV__ !== "undefined" && __DEV__;
const EXPLICIT_INTERNAL_TOOLS = String(process.env.EXPO_PUBLIC_ENABLE_INTERNAL_TOOLS || "").toLowerCase() === "true";

export const INTERNAL_TOOLS_ENABLED = DEV_ENABLED || EXPLICIT_INTERNAL_TOOLS;

export const canAccessInternalTools = () => INTERNAL_TOOLS_ENABLED;
