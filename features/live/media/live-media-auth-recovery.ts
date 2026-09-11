import { ensureFreshSession, recoverSupabaseConnectivity } from '@/lib/supabase';

const isRecovered = (status: string) => status === 'ok' || status === 'refreshed';

/**
 * A Live token request can race Supabase's foreground session refresh after
 * the app has been suspended. Recover once, then let the original admission
 * path retry without weakening any server-side Live authorization checks.
 */
export const recoverLiveMediaAdmissionAuthentication = async (): Promise<boolean> => {
  const sessionStatus = await ensureFreshSession();
  if (isRecovered(sessionStatus)) return true;

  const recovery = await recoverSupabaseConnectivity(
    'live_media_admission_unauthorized',
    { maxRefreshAttempts: 1 },
  );
  return isRecovered(recovery.status);
};
