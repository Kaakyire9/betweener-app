import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import { redact } from "@/lib/telemetry/redact";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export const initSentry = () => {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const release =
    Constants.nativeAppVersion ||
    (typeof Constants.expoConfig?.version === "string" ? Constants.expoConfig.version : undefined) ||
    undefined;

  Sentry.init({
    dsn,
    enabled: true,
    // Enable SDK diagnostics in dev to help troubleshoot transport/rejection issues.
    debug: isDev,
    enableLogs: true,
    // Keep default PII off; we explicitly set user id only elsewhere.
    sendDefaultPii: false,
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT || (isDev ? "development" : "production"),
    release,

    // Keep this conservative for early testing; adjust after you see volume.
    tracesSampleRate: isDev ? 1.0 : 0.15,

    beforeBreadcrumb(breadcrumb) {
      try {
        return {
          ...breadcrumb,
          message: breadcrumb.message ? String(redact(breadcrumb.message)) : breadcrumb.message,
          data: breadcrumb.data ? (redact(breadcrumb.data) as Record<string, unknown>) : breadcrumb.data,
        };
      } catch {
        return breadcrumb;
      }
    },

    beforeSend(event) {
      try {
        // IMPORTANT: Avoid deep "shape-changing" redaction here; it can produce payloads Sentry rejects.
        // Keep this conservative and do most scrubbing at the breadcrumb layer.
        const safe: any = { ...event };

        // Keep only a stable user id (no email/ip).
        if (safe.user) {
          safe.user = safe.user?.id ? { id: String(safe.user.id) } : null;
        }

        // Redact common sensitive keys if we ever attach them (extra/context), but do NOT touch stacktraces.
        if (safe.extra) safe.extra = redact(safe.extra) as Record<string, unknown>;
        if (safe.contexts) safe.contexts = redact(safe.contexts) as Record<string, unknown>;

        if (isDev) {
          // Helpful debug without leaking payload contents.
          console.log("[sentry] beforeSend", {
            eventId: safe.event_id ?? null,
            env: safe.environment ?? null,
            release: safe.release ?? null,
          });
        }

        return safe;
      } catch {
        return event;
      }
    },
  });
};

export const setSentryUser = (userId: string | null) => {
  if (!userId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: userId });
};

export const addBreadcrumb = (message: string, data?: Record<string, unknown>) => {
  try {
    Sentry.addBreadcrumb({
      message,
      level: "info",
      data: data ? (redact(data) as Record<string, unknown>) : undefined,
    });
  } catch {
    // best-effort only
  }
};

export const captureException = (error: unknown, context?: Record<string, unknown>) => {
  try {
    if (context) {
      Sentry.setContext("context", redact(context) as Record<string, unknown>);
    }
    Sentry.captureException(error);
  } catch {
    // best-effort only
  }
};

export const captureMessage = (message: string, context?: Record<string, unknown>) => {
  try {
    if (context) {
      Sentry.setContext("context", redact(context) as Record<string, unknown>);
    }
    Sentry.captureMessage(String(redact(message)));
  } catch {
    // best-effort only
  }
};

export const wrapWithSentry = <T,>(component: T): T => {
  // Sentry.wrap preserves the component type at runtime; TS needs a cast.
  return (Sentry.wrap(component as any) as unknown) as T;
};
