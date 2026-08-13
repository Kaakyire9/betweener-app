import { supabase } from '@/lib/supabase';
import { parseLiveMediaAdmission } from './live-media-admission.ts';
import type {
  LiveMediaAdmission,
  LiveMediaAdmissionRequest,
} from './live-media-provider.ts';

type FunctionErrorWithContext = Error & {
  context?: Response;
};

const readFunctionErrorCode = async (error: unknown): Promise<string> => {
  const context = (error as FunctionErrorWithContext | null)?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const payload = await context.clone().json() as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
    } catch {
      // Preserve the transport error below when the response is not JSON.
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'live_token_temporarily_unavailable';
};

export const requestLiveMediaAdmission = async (
  request: LiveMediaAdmissionRequest,
): Promise<LiveMediaAdmission> => {
  const { data, error } = await supabase.functions.invoke('live-rtc-token', {
    body: request,
  });

  if (error) throw new Error(await readFunctionErrorCode(error));
  return parseLiveMediaAdmission(data);
};
