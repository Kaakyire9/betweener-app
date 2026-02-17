type AnyRecord = Record<string, unknown>;

const SENSITIVE_KEYS = new Set(
  [
    "password",
    "pass",
    "passwd",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "apikey",
    "api_key",
    "secret",
    "secret_key",
    "service_role",
    "service_role_key",
    "phone",
    "phoneNumber",
    "phone_number",
    "email",
    "verificationSid",
    "sid",
  ].map((k) => k.toLowerCase())
);

const looksLikeJwt = (s: string) => {
  const parts = s.split(".");
  return parts.length === 3 && parts[0].length > 5 && parts[1].length > 5;
};

const looksLikeAccessToken = (s: string) => s.startsWith("sbp_") || looksLikeJwt(s);

const looksLikeEmail = (s: string) => {
  // Cheap heuristic; good enough for redaction.
  return s.includes("@") && s.includes(".") && s.length <= 254;
};

const looksLikePhone = (s: string) => {
  // "+441234..." or "233..." etc; avoid redacting short numeric strings.
  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 8 && (s.trim().startsWith("+") || digits.length >= 10);
};

const redactString = (s: string) => {
  if (looksLikeAccessToken(s)) return "<token>";
  if (looksLikeEmail(s)) return "<email>";
  if (looksLikePhone(s)) return "<phone>";
  return s;
};

export const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return "<redacted_depth>";

  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  if (typeof value === "object") {
    const obj = value as AnyRecord;
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "<redacted>";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }

  return "<redacted>";
};

