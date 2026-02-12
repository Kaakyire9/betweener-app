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
    debug: false,
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
        // Redact common fields. Keep the event shape intact.
        const safe = redact(event) as any;
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
