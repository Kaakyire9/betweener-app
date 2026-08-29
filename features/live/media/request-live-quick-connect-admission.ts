import { supabase } from '@/lib/supabase';
import { parseLiveMediaAdmission } from './live-media-admission.ts';
import { readFunctionErrorCode } from './live-function-error.ts';
import type {
  LiveMediaAdmission,
  LiveMediaAdmissionRequest,
} from './live-media-provider.ts';

/** Quick Connect uses the pairing id as its isolated two-person RTC room id. */
export const requestLiveQuickConnectAdmission = async (
  request: LiveMediaAdmissionRequest,
): Promise<LiveMediaAdmission> => {
  const { data, error } = await supabase.functions.invoke('live-quick-connect-token', {
    body: { pairingId: request.sessionId },
  });

  if (error) throw new Error(await readFunctionErrorCode(error));
  return parseLiveMediaAdmission(data, { allowPrivateSpark: true });
};
