import { getInstalledAppVersion } from '@/lib/app-version/app-version-service';
import { supabase } from '@/lib/supabase';

export const CURRENT_TERMS_VERSION = '2026-09-15';
export const CURRENT_PRIVACY_VERSION = '2026-09-15';

const recordedUsers = new Set<string>();

export async function recordCurrentLegalAcceptance(userId: string) {
  if (!userId || recordedUsers.has(userId)) return;
  const { error } = await (supabase.rpc as any)('rpc_record_current_legal_acceptance_v1', {
    p_terms_version: CURRENT_TERMS_VERSION,
    p_privacy_version: CURRENT_PRIVACY_VERSION,
    p_app_version: getInstalledAppVersion().version,
  });
  if (error) throw error;
  recordedUsers.add(userId);
}
