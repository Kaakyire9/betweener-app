export type RevenueCatEnvironment = "SANDBOX" | "PRODUCTION";

export type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
  environment?: string | null;
  purchase_environment?: string | null;
  event_timestamp_ms?: number | null;
};

export type RevenueCatEnvironmentResolution = {
  environment: RevenueCatEnvironment | null;
  source: "event.environment" | "event.purchase_environment" | "missing" | "unsupported";
  rawValue: string | null;
};

const asArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const extractEvent = (payload: any): RevenueCatEvent => {
  const event = payload?.event && typeof payload.event === "object" ? payload.event : payload;
  return {
    id: normalizeString(event?.id),
    type: normalizeString(event?.type),
    app_user_id: normalizeString(event?.app_user_id),
    original_app_user_id: normalizeString(event?.original_app_user_id),
    aliases: asArray(event?.aliases),
    transferred_from: asArray(event?.transferred_from),
    transferred_to: asArray(event?.transferred_to),
    environment: normalizeString(event?.environment),
    purchase_environment: normalizeString(event?.purchase_environment),
    event_timestamp_ms: typeof event?.event_timestamp_ms === "number" ? event.event_timestamp_ms : null,
  };
};

const normalizeEnvironment = (value: string | null | undefined): RevenueCatEnvironment | null => {
  const normalized = normalizeString(value)?.toUpperCase();
  return normalized === "SANDBOX" || normalized === "PRODUCTION" ? normalized : null;
};

export const resolveRevenueCatEventEnvironment = (
  event: Pick<RevenueCatEvent, "environment" | "purchase_environment">,
): RevenueCatEnvironmentResolution => {
  const direct = normalizeString(event.environment);
  const normalizedDirect = normalizeEnvironment(direct);
  if (normalizedDirect) {
    return {
      environment: normalizedDirect,
      source: "event.environment",
      rawValue: direct,
    };
  }

  const purchase = normalizeString(event.purchase_environment);
  const normalizedPurchase = normalizeEnvironment(purchase);
  if (normalizedPurchase) {
    return {
      environment: normalizedPurchase,
      source: "event.purchase_environment",
      rawValue: purchase,
    };
  }

  const unsupported = direct || purchase;
  if (unsupported) {
    return { environment: null, source: "unsupported", rawValue: unsupported };
  }

  return { environment: null, source: "missing", rawValue: null };
};
