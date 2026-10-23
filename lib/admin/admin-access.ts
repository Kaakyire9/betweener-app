import { useAuth } from '@/lib/auth-context';
import { canAccessInternalTools } from '@/lib/internal-tools';
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type AdminCapability =
  | 'overview'
  | 'community'
  | 'editorial'
  | 'live'
  | 'trust'
  | 'accounts'
  | 'commerce';

export type AdminRole = 'operations' | 'moderation' | 'support' | 'super_admin';

export type AdminContext = {
  isAdmin: boolean;
  role: AdminRole | null;
  capabilities: AdminCapability[];
};

const EMPTY_CONTEXT: AdminContext = {
  isAdmin: false,
  role: null,
  capabilities: [],
};

const ADMIN_CAPABILITIES = new Set<AdminCapability>([
  'overview',
  'community',
  'editorial',
  'live',
  'trust',
  'accounts',
  'commerce',
]);
const ALL_ADMIN_CAPABILITIES = Array.from(ADMIN_CAPABILITIES);

const normalizeAdminContext = (value: unknown): AdminContext => {
  if (!value || typeof value !== 'object') return EMPTY_CONTEXT;
  const candidate = value as Record<string, unknown>;
  if (candidate.isAdmin !== true) return EMPTY_CONTEXT;

  const role = typeof candidate.role === 'string' ? candidate.role : null;
  if (!['operations', 'moderation', 'support', 'super_admin'].includes(role ?? '')) {
    return EMPTY_CONTEXT;
  }

  const capabilities = Array.isArray(candidate.capabilities)
    ? candidate.capabilities.filter(
        (capability): capability is AdminCapability =>
          typeof capability === 'string' && ADMIN_CAPABILITIES.has(capability as AdminCapability),
      )
    : [];

  return {
    isAdmin: true,
    role: role as AdminRole,
    capabilities,
  };
};

export const getRuntimeEnvironmentLabel = () => {
  const environment = String(process.env.EXPO_PUBLIC_ENVIRONMENT || 'development').trim().toLowerCase();
  if (environment === 'production') return 'PRODUCTION';
  if (environment === 'staging' || environment === 'preview') return 'STAGING';
  return 'DEVELOPMENT';
};

export const getRevenueCatBackfillEnvironment = () =>
  getRuntimeEnvironmentLabel() === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';

export const useAdminAccess = () => {
  const { user } = useAuth();
  const [context, setContext] = useState<AdminContext>(EMPTY_CONTEXT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id || !canAccessInternalTools()) {
      setContext(EMPTY_CONTEXT);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await (supabase as any).rpc('rpc_get_my_admin_context');
    if (error) {
      // Backward-compatible rollout: the existing server-side admin check remains
      // authoritative until the role-context migration reaches this environment.
      const legacy = await (supabase as any).rpc('is_internal_admin');
      setContext(legacy.data === true
        ? { isAdmin: true, role: 'super_admin', capabilities: ALL_ADMIN_CAPABILITIES }
        : EMPTY_CONTEXT);
      setLoading(false);
      return;
    }

    setContext(normalizeAdminContext(data));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      ...context,
      loading,
      refresh,
      can: (capability: AdminCapability) => context.capabilities.includes(capability),
    }),
    [context, loading, refresh],
  );
};
