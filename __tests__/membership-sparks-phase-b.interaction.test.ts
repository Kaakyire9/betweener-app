import { afterEach, describe, expect, it } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runAuthMonetizationTeardown } from '@/lib/auth/auth-monetization-lifecycle';
import {
  DISABLED_ECONOMY_FEATURE_FLAGS,
  normalizeEconomyFeatureFlags,
} from '@/lib/economy/feature-flags';
import { selectEconomyRule } from '@/lib/economy/rules';
import {
  getMembershipBenefits,
  hasMembershipFeature,
} from '@/lib/membership/membership-benefits';
import {
  getMembershipTier,
  resolveEffectiveMembershipTier,
  resolveMembershipTier,
} from '@/lib/membership/membership-resolver';
import {
  MembershipConfigurationError,
  resolveExactMembershipCatalog,
  resolveExactSparkCatalog,
} from '@/lib/membership/offering-resolver';
import {
  RevenueCatIdentitySession,
  type RevenueCatIdentityAdapter,
} from '@/lib/membership/revenuecat-identity-core';
import {
  computeRevenueCatWebhookSignature,
  verifyRevenueCatWebhookSignature,
} from '@/supabase/functions/_shared/revenuecat-webhook-signature';
import { isRevenueCatWebhookAuthorized } from '@/supabase/functions/_shared/revenuecat-webhook-auth';
import {
  extractEvent,
  resolveRevenueCatEventEnvironment,
} from '@/supabase/functions/_shared/revenuecat-event';
import {
  assertIdentifiedAccountOwnership,
  isAnonymousRevenueCatAppUserId,
} from '@/lib/economy/account-ownership-core';
import { sparkWalletStore } from '@/lib/economy/wallet/spark-wallet-store';
import { clearClientFinancialState } from '@/lib/economy/financial-state-reset';

const ORIGINAL_ENV = { ...process.env };
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('canonical membership resolution', () => {
  it('uses exact entitlement IDs with Gold precedence', () => {
    expect(getMembershipTier({ entitlements: { active: { silver: {}, gold: {} } } })).toBe('gold');
    expect(getMembershipTier({ entitlements: { active: { silver: {} } } })).toBe('silver');
    expect(getMembershipTier({ entitlements: { active: { GOLD: {}, silver_plus: {} } } })).toBe('free');
  });

  it('isolates the legacy product fallback behind an explicit option', () => {
    const customerInfo = { activeSubscriptions: ['com.betweener.premium.gold.annual'] };
    expect(resolveMembershipTier(customerInfo).tier).toBe('free');
    expect(resolveMembershipTier(customerInfo, {
      allowLegacyProductFallback: true,
      legacyProductHints: { silver: 'com.betweener.premium.silver', gold: 'com.betweener.premium.gold' },
    })).toEqual({ tier: 'gold', source: 'legacy_product' });
  });

  it('does not let a stale staging mirror promote membership', () => {
    expect(resolveEffectiveMembershipTier({
      authoritativeRevenueCatTier: 'free',
      mirroredSupabaseTier: 'gold',
      preserveProductionMirrorPromotion: false,
    })).toBe('free');
    expect(resolveEffectiveMembershipTier({
      authoritativeRevenueCatTier: 'free',
      mirroredSupabaseTier: 'gold',
      preserveProductionMirrorPromotion: true,
    })).toBe('gold');
  });

  it('keeps the server mirror exact in staging and isolates the production fallback', () => {
    const syncSource = readFileSync(
      'supabase/functions/_shared/revenuecat-subscription-sync.ts',
      'utf8',
    );
    expect(syncSource).toMatch(/normalizedEntitlement === GOLD_ENTITLEMENT/);
    expect(syncSource).toMatch(/normalizedEntitlement === SILVER_ENTITLEMENT/);
    expect(syncSource).not.toMatch(/normalizedEntitlement\.includes/);
    expect(syncSource).toMatch(/ALLOW_LEGACY_PRODUCT_FALLBACK[\s\S]*=== "production"/);
  });
});

describe('membership benefits policy', () => {
  it('owns Sparks and Profile Boost allowances centrally', () => {
    expect(getMembershipBenefits('free').monthlyMemberSparks).toBe(0);
    expect(getMembershipBenefits('silver').monthlyMemberSparks).toBe(150);
    expect(getMembershipBenefits('silver').monthlyProfileBoostAllowance).toBe(1);
    expect(getMembershipBenefits('gold').monthlyProfileBoostAllowance).toBe(2);
    expect(getMembershipBenefits('gold').firstEligibleMatchNightEntryIncluded).toBe(true);
    expect(hasMembershipFeature('silver', 'advanced_filters')).toBe(true);
    expect(hasMembershipFeature('free', 'advanced_filters')).toBe(false);
  });
});

const membershipPackages = () => ['silver', 'gold'].flatMap((tier) =>
  ['monthly', 'quarterly', 'annual'].map((interval) => ({
    identifier: `${tier}_${interval}`,
    product: { identifier: `com.betweener.staging.premium.${tier}.${interval}` },
  })),
);

const membershipProductIds = {
  silver: {
    monthly: 'com.betweener.staging.premium.silver.monthly',
    quarterly: 'com.betweener.staging.premium.silver.quarterly',
    annual: 'com.betweener.staging.premium.silver.annual',
  },
  gold: {
    monthly: 'com.betweener.staging.premium.gold.monthly',
    quarterly: 'com.betweener.staging.premium.gold.quarterly',
    annual: 'com.betweener.staging.premium.gold.annual',
  },
};

describe('exact offering and package resolution', () => {
  it('resolves the exact membership offering, package and product maps', () => {
    const catalog = resolveExactMembershipCatalog({
      all: { default: { identifier: 'default', availablePackages: membershipPackages() } },
    }, membershipProductIds);
    expect(catalog.silver.monthly.identifier).toBe('silver_monthly');
    expect(catalog.gold.annual.identifier).toBe('gold_annual');
  });

  it('fails closed for a missing offering or wrong staging product', () => {
    expect(() => resolveExactMembershipCatalog({ all: {} }, membershipProductIds)).toThrow(MembershipConfigurationError);
    const packages = membershipPackages();
    packages[0].product.identifier = 'com.betweener.premium.silver.monthly';
    expect(() => resolveExactMembershipCatalog({
      all: { default: { identifier: 'default', availablePackages: packages } },
    }, membershipProductIds)).toThrow(MembershipConfigurationError);
  });

  it('resolves only the four exact Spark packages', () => {
    const packages = ['sparks_100', 'sparks_550', 'sparks_1200', 'sparks_2600'].map((identifier) => ({
      identifier,
      product: { identifier: `product.${identifier}` },
    }));
    expect(Object.keys(resolveExactSparkCatalog({
      all: { spark_store: { identifier: 'spark_store', availablePackages: packages } },
    }))).toEqual(['sparks_100', 'sparks_550', 'sparks_1200', 'sparks_2600']);
  });
});

const makeIdentityAdapter = () => {
  const calls = { configure: [] as string[], logIn: [] as string[], logOut: 0 };
  let configured = false;
  let appUserId: string | null = null;
  let logoutError: Error | null = null;
  const adapter: RevenueCatIdentityAdapter = {
    isConfigured: async () => configured,
    configure: (nextUserId) => {
      configured = true;
      appUserId = nextUserId;
      calls.configure.push(nextUserId);
    },
    getAppUserId: async () => appUserId,
    logIn: async (nextUserId) => {
      appUserId = nextUserId;
      calls.logIn.push(nextUserId);
    },
    logOut: async () => {
      calls.logOut += 1;
      if (logoutError) throw logoutError;
      appUserId = null;
    },
  };
  return { adapter, calls, setLogoutError: (error: Error | null) => { logoutError = error; } };
};

describe('RevenueCat identity lifecycle', () => {
  it('supports login, direct account switch, same-user re-login and local detach', async () => {
    const mock = makeIdentityAdapter();
    const session = new RevenueCatIdentitySession(mock.adapter);
    await session.bind(USER_A);
    expect(mock.calls.configure).toEqual([USER_A]);
    expect(session.canAccessFor(USER_A)).toBe(true);

    await session.bind(USER_A);
    expect(mock.calls.logIn).toEqual([]);

    await session.bind(USER_B);
    expect(mock.calls.logIn).toEqual([USER_B]);
    expect(session.canAccessFor(USER_A)).toBe(false);
    expect(session.canAccessFor(USER_B)).toBe(true);

    session.detach('logout');
    expect(mock.calls.logOut).toBe(0);
    expect(session.canAccessFor(USER_B)).toBe(false);
  });

  it('fails closed when a terminal RevenueCat SDK logout is unavailable', async () => {
    const mock = makeIdentityAdapter();
    const session = new RevenueCatIdentitySession(mock.adapter);
    await session.bind(USER_A);
    mock.setLogoutError(new Error('offline'));
    const result = await session.clearSdkIdentity('deleted_account_cleanup');
    expect(result.error).toBeInstanceOf(Error);
    expect(session.canAccessFor(USER_A)).toBe(false);
  });

  it('rebinds account recovery to the recovered Supabase user without leaking the prior user', async () => {
    const mock = makeIdentityAdapter();
    const session = new RevenueCatIdentitySession(mock.adapter);
    await session.bind(USER_A);

    session.detach('account_recovery');
    await session.bind(USER_B);

    expect(mock.calls.logOut).toBe(0);
    expect(mock.calls.logIn).toEqual([USER_B]);
    expect(session.canAccessFor(USER_A)).toBe(false);
    expect(session.canAccessFor(USER_B)).toBe(true);
  });

  it('rejects non-Supabase identities', async () => {
    const mock = makeIdentityAdapter();
    const session = new RevenueCatIdentitySession(mock.adapter);
    await expect(session.bind('person@example.com')).rejects.toThrow('Supabase UUID');
  });

  it('clears User A wallet state immediately on local logout', () => {
    sparkWalletStore.switchIdentity(USER_A);
    const version = sparkWalletStore.getIdentityVersion();
    sparkWalletStore.accept({
      appUserId: USER_A,
      currencyCode: 'SPK',
      balance: 250,
      status: 'fresh',
      isStale: false,
      fetchedAt: new Date().toISOString(),
      source: 'revenuecat',
      errorCode: null,
    }, version);

    clearClientFinancialState();

    expect(sparkWalletStore.getSnapshot()).toMatchObject({ appUserId: '', balance: null, status: 'idle' });
  });
});

describe('identified-only commerce ownership', () => {
  it('allows commerce only when Supabase and RevenueCat equal the expected UUID', () => {
    expect(assertIdentifiedAccountOwnership({
      expectedUserId: USER_A,
      supabaseUserId: USER_A,
      revenueCatAppUserId: USER_A,
    })).toEqual({ appUserId: USER_A });
  });

  it('blocks an authenticated UUID mismatch', () => {
    expect(() => assertIdentifiedAccountOwnership({
      expectedUserId: USER_A,
      supabaseUserId: USER_A,
      revenueCatAppUserId: USER_B,
    })).toThrow(expect.objectContaining({ code: 'ACCOUNT_PREPARATION_REQUIRED' }));
  });

  it('blocks a RevenueCat anonymous identity for an authenticated user', () => {
    const anonymousId = '$RCAnonymousID:fixture';
    expect(isAnonymousRevenueCatAppUserId(anonymousId)).toBe(true);
    expect(() => assertIdentifiedAccountOwnership({
      expectedUserId: USER_A,
      supabaseUserId: USER_A,
      revenueCatAppUserId: anonymousId,
    })).toThrow(expect.objectContaining({ code: 'ACCOUNT_PREPARATION_REQUIRED' }));
  });
});

describe('canonical auth and monetization teardown', () => {
  it('does not create an anonymous RevenueCat identity during normal logout', async () => {
    const calls: string[] = [];
    const result = await runAuthMonetizationTeardown({
      blockRevenueCatAccess: () => calls.push('block'),
      supabaseSignOut: async () => {
        calls.push('supabase');
        return { error: null };
      },
    });
    expect(calls).toEqual(['block', 'supabase']);
    expect(result.revenueCatError).toBeNull();
    expect(result.supabaseError).toBeNull();
  });

  it('attempts Supabase logout when an explicit terminal SDK logout fails', async () => {
    const calls: string[] = [];
    const result = await runAuthMonetizationTeardown({
      blockRevenueCatAccess: () => calls.push('block'),
      revenueCatLogOut: async () => {
        calls.push('revenuecat');
        return { error: new Error('unavailable') };
      },
      supabaseSignOut: async () => {
        calls.push('supabase');
        return { error: null };
      },
    });
    expect(calls).toEqual(['block', 'revenuecat', 'supabase']);
    expect(result.revenueCatError).toBeInstanceOf(Error);
  });

  it('keeps RevenueCat access blocked when Supabase logout fails', async () => {
    let blocked = false;
    const result = await runAuthMonetizationTeardown({
      blockRevenueCatAccess: () => { blocked = true; },
      supabaseSignOut: async () => ({ error: new Error('network') }),
    });
    expect(blocked).toBe(true);
    expect(result.supabaseError).toBeInstanceOf(Error);
  });
});

describe('economy feature flags', () => {
  it('defaults every flag off and ignores unknown keys', () => {
    expect(Object.values(DISABLED_ECONOMY_FEATURE_FLAGS).every((enabled) => !enabled)).toBe(true);
    const flags = normalizeEconomyFeatureFlags([
      { flag_key: 'spark_wallet_enabled', enabled: true },
      { flag_key: 'unknown_flag', enabled: true },
    ]);
    expect(flags.spark_wallet_enabled).toBe(true);
    expect('unknown_flag' in flags).toBe(false);
  });

  it('selects the exact environment, action, tier and latest rule version', () => {
    const base = {
      id: 'rule-1',
      environment: 'staging' as const,
      actionCode: 'SUPER_SPARK' as const,
      membershipTier: 'silver' as const,
      priceSparks: 15,
      included: false,
      version: 1,
    };
    const selected = selectEconomyRule([
      base,
      { ...base, id: 'rule-2', version: 2, priceSparks: 14 },
      { ...base, id: 'production', environment: 'production', priceSparks: 999 },
    ], {
      environment: 'staging',
      actionCode: 'SUPER_SPARK',
      membershipTier: 'silver',
    });
    expect(selected.id).toBe('rule-2');
    expect(() => selectEconomyRule([], {
      environment: 'staging',
      actionCode: 'SUPER_SPARK',
      membershipTier: 'silver',
    })).toThrow('not available');
  });
});

describe('RevenueCat webhook HMAC', () => {
  it('accepts exact Authorization and rejects invalid Authorization', () => {
    expect(isRevenueCatWebhookAuthorized({
      authorizationHeader: 'Bearer fixture',
      webhookSecret: 'Bearer fixture',
    })).toBe(true);
    expect(isRevenueCatWebhookAuthorized({
      authorizationHeader: 'Bearer wrong',
      webhookSecret: 'Bearer fixture',
    })).toBe(false);
  });

  it('accepts a valid raw-body signature and rejects mutation or replay', async () => {
    const rawBody = new TextEncoder().encode('{"event":{"id":"evt_1"}}');
    const timestamp = '1790712000';
    const secret = 'fixture-secret';
    const signature = await computeRevenueCatWebhookSignature(rawBody, timestamp, secret);
    const header = `t=${timestamp},v1=${signature}`;
    const nowMs = Number(timestamp) * 1000;

    await expect(verifyRevenueCatWebhookSignature({ rawBody, header, secret, nowMs }))
      .resolves.toEqual({ valid: true, timestamp: Number(timestamp) });
    await expect(verifyRevenueCatWebhookSignature({
      rawBody: new TextEncoder().encode('{"event":{"id":"evt_2"}}'),
      header,
      secret,
      nowMs,
    })).resolves.toEqual({ valid: false, reason: 'invalid_signature' });
    await expect(verifyRevenueCatWebhookSignature({
      rawBody,
      header,
      secret,
      nowMs: nowMs + 301_000,
    })).resolves.toEqual({ valid: false, reason: 'timestamp_outside_tolerance' });
  });

  it('uses the durable inbox before legacy processing and retains TEST-event compatibility', () => {
    const webhook = readFileSync('supabase/functions/revenuecat-webhook/index.ts', 'utf8');
    expect(webhook).toMatch(/rpc_service_claim_revenuecat_webhook_event_v1[\s\S]*!claim\?\.should_process[\s\S]*duplicate: true/i);
    expect(webhook.indexOf('rpc_service_claim_revenuecat_webhook_event_v1'))
      .toBeLessThan(webhook.indexOf('.from("revenuecat_webhook_events")\n      .insert(eventRow)'));
    expect(webhook).toMatch(/event\.type[^\n]*=== "TEST"[\s\S]*reason: "test_event"/i);
  });
});

describe('RevenueCat event environment provenance', () => {
  it('prefers and normalizes event.environment', () => {
    const event = extractEvent({ event: { environment: 'sandbox', purchase_environment: 'PRODUCTION' } });
    expect(resolveRevenueCatEventEnvironment(event)).toEqual({
      environment: 'SANDBOX',
      source: 'event.environment',
      rawValue: 'sandbox',
    });
  });

  it('uses purchase_environment for virtual-currency sandbox events', () => {
    const event = extractEvent({ event: {
      type: 'VIRTUAL_CURRENCY_TRANSACTION',
      purchase_environment: 'SANDBOX',
    } });
    expect(resolveRevenueCatEventEnvironment(event)).toEqual({
      environment: 'SANDBOX',
      source: 'event.purchase_environment',
      rawValue: 'SANDBOX',
    });
  });

  it('does not lose a supported purchase environment behind an unsupported primary field', () => {
    expect(resolveRevenueCatEventEnvironment({
      environment: 'unknown',
      purchase_environment: 'SANDBOX',
    })).toEqual({
      environment: 'SANDBOX',
      source: 'event.purchase_environment',
      rawValue: 'SANDBOX',
    });
  });

  it.each([
    ['environment', { environment: 'production' }],
    ['purchase_environment', { purchase_environment: 'production' }],
  ])('normalizes production from %s', (_field, event) => {
    expect(resolveRevenueCatEventEnvironment(event)).toMatchObject({ environment: 'PRODUCTION' });
  });

  it('makes missing and unsupported environments explicit', () => {
    expect(resolveRevenueCatEventEnvironment({})).toEqual({
      environment: null,
      source: 'missing',
      rawValue: null,
    });
    expect(resolveRevenueCatEventEnvironment({ purchase_environment: 'preview' })).toEqual({
      environment: null,
      source: 'unsupported',
      rawValue: 'preview',
    });
  });

  it('persists the normalized purchase environment into the subscription mirror', () => {
    const syncSource = readFileSync(
      'supabase/functions/_shared/revenuecat-subscription-sync.ts',
      'utf8',
    );
    const webhookSource = readFileSync('supabase/functions/revenuecat-webhook/index.ts', 'utf8');
    expect(syncSource).toContain('eventEnvironment.environment');
    expect(syncSource).toContain('resolved.environment ? { external_environment: resolved.environment } : {}');
    expect(webhookSource).toMatch(/syncUserSubscription\([\s\S]*environmentResolution,/);
  });
});

describe('database foundation contract', () => {
  const migration = readFileSync(
    'supabase/migrations/20260929100000_membership_sparks_phase_b_foundation.sql',
    'utf8',
  );
  const inboxHardeningMigration = readFileSync(
    'supabase/migrations/20260930120000_revenuecat_webhook_inbox_hardening.sql',
    'utf8',
  );

  it('creates every required structure without an authoritative local balance', () => {
    for (const table of [
      'economy_action_rules',
      'spark_spend_intents',
      'spark_ledger_events',
      'revenuecat_webhook_inbox',
      'economy_passes',
      'economy_reconciliation_runs',
      'economic_risk_events',
    ]) expect(migration).toMatch(new RegExp(`create table public\\.${table}`, 'i'));
    expect(migration).not.toMatch(/(?:profiles|users)\.spark_balance/i);
  });

  it('keeps rules staging-only, flags off and the ledger append-only', () => {
    expect(migration).not.toMatch(/\('production',\s*'MATCH_NIGHT/i);
    expect(migration).toMatch(/spark_ledger_events_append_only/i);
    expect(migration).toMatch(/raise exception 'spark_ledger_events_append_only'/i);
    expect(migration).toMatch(/Phase B foundation: financial actions remain disabled/i);
  });

  it('blocks authenticated mutations and protects server policy functions', () => {
    expect(migration).toMatch(/revoke all on table public\.spark_ledger_events from anon, authenticated/i);
    expect(migration).toMatch(/revoke all on table public\.economy_action_rules from anon, authenticated/i);
    expect(migration).toMatch(/economy_service_role_required/i);
    expect(migration).toMatch(/economy_feature_disabled/i);
  });

  it('claims each inbox event atomically and observes duplicates without reprocessing', () => {
    expect(inboxHardeningMigration).toMatch(/on conflict \(revenuecat_event_id\) do nothing/i);
    expect(inboxHardeningMigration).toMatch(/'should_process', true/i);
    expect(inboxHardeningMigration).toMatch(/delivery_count = delivery_count \+ 1/i);
    expect(inboxHardeningMigration).toMatch(/'should_process', false/i);
    expect(inboxHardeningMigration).toMatch(/grant execute[\s\S]*to service_role/i);
    expect(inboxHardeningMigration).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i);
  });
});
