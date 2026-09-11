import { supabase } from '@/lib/supabase';
import { parseLiveMediaAdmission } from './live-media-admission.ts';
import { recoverLiveMediaAdmissionAuthentication } from './live-media-auth-recovery.ts';
import { requestWithLiveMediaAdmissionRetry } from './live-media-admission-retry.ts';
import { readFunctionErrorCode } from './live-function-error.ts';
import type {
  LiveMediaAdmission,
  LiveMediaAdmissionRequest,
  LiveMediaAdmissionRequestOptions,
} from './live-media-provider.ts';

/** Quick Connect uses the pairing id as its isolated two-person RTC room id. */
export const requestLiveQuickConnectAdmission = async (
  request: LiveMediaAdmissionRequest,
  options?: LiveMediaAdmissionRequestOptions,
): Promise<LiveMediaAdmission> => requestWithLiveMediaAdmissionRetry(async () => {
  const { data, error } = await supabase.functions.invoke('live-quick-connect-token', {
    body: { pairingId: request.sessionId },
  });

  if (error) throw new Error(await readFunctionErrorCode(error));
  return parseLiveMediaAdmission(data, { allowPrivateSpark: true });
}, {
  recoverAuthentication:
    options?.recoverAuthentication ?? recoverLiveMediaAdmissionAuthentication,
});
