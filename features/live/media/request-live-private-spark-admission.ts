import { supabase } from '@/lib/supabase';
import { parseLiveMediaAdmission } from './live-media-admission.ts';
import { requestWithLiveMediaAdmissionRetry } from './live-media-admission-retry.ts';
import { readFunctionErrorCode } from './live-function-error.ts';
import type {
  LiveMediaAdmission,
  LiveMediaAdmissionRequest,
} from './live-media-provider.ts';

/**
 * Private Spark uses a dedicated function and provider call. The public room
 * token endpoint must never be able to admit a host into this transport.
 */
export const requestLivePrivateSparkAdmission = async (
  request: LiveMediaAdmissionRequest,
): Promise<LiveMediaAdmission> => requestWithLiveMediaAdmissionRetry(async () => {
  const { data, error } = await supabase.functions.invoke('live-private-spark-token', {
    body: { privateSparkId: request.sessionId },
  });

  if (error) throw new Error(await readFunctionErrorCode(error));
  return parseLiveMediaAdmission(data, { allowPrivateSpark: true });
});
