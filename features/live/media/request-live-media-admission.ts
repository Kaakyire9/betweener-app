import { supabase } from '@/lib/supabase';
import { parseLiveMediaAdmission } from './live-media-admission.ts';
import type {
  LiveMediaAdmission,
  LiveMediaAdmissionRequest,
} from './live-media-provider.ts';

export const requestLiveMediaAdmission = async (
  request: LiveMediaAdmissionRequest,
): Promise<LiveMediaAdmission> => {
  const { data, error } = await supabase.functions.invoke('live-rtc-token', {
    body: request,
  });

  if (error) throw error;
  return parseLiveMediaAdmission(data);
};
