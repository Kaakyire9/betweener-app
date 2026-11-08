export function isRevenueCatWebhookAuthorized(args: {
  authorizationHeader: string | null;
  webhookSecret: string;
  webhookSecretQuery?: string | null;
  legacySecretQuery?: string | null;
}) {
  const expected = args.webhookSecret.trim();
  if (!expected) return false;
  const providedAuth = String(args.authorizationHeader || '').trim();
  const querySecret = String(
    args.webhookSecretQuery || args.legacySecretQuery || '',
  ).trim();
  return providedAuth === expected || querySecret === expected;
}
