import { redact } from "@/lib/telemetry/redact";
import { addBreadcrumb, captureException } from "@/lib/telemetry/sentry";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

type Ctx = Record<string, unknown>;

const safeCtx = (ctx?: Ctx) => (ctx ? (redact(ctx) as Ctx) : undefined);

export const logger = {
  debug(message: string, ctx?: Ctx) {
    const data = safeCtx(ctx);
    if (isDev) console.log(message, data ?? "");
    addBreadcrumb(message, data);
  },

  info(message: string, ctx?: Ctx) {
    const data = safeCtx(ctx);
    if (isDev) console.log(message, data ?? "");
    addBreadcrumb(message, data);
  },

  warn(message: string, ctx?: Ctx) {
    const data = safeCtx(ctx);
    if (isDev) console.warn(message, data ?? "");
    addBreadcrumb(message, data);
  },

  error(message: string, error?: unknown, ctx?: Ctx) {
    const data = safeCtx(ctx);
    if (isDev) console.error(message, data ?? "", error ?? "");
    captureException(error ?? new Error(message), { message, ...(data ?? {}) });
  },
};

