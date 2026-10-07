import { supabase } from '@/lib/supabase';

export type UgcContentType = 'moment' | 'circle_pulse_item';
export type UgcReportReason =
  | 'NUDITY_OR_SEXUAL_CONTENT'
  | 'HARASSMENT_OR_HATE'
  | 'SCAM_OR_SOLICITATION'
  | 'VIOLENCE_OR_DANGER'
  | 'OTHER';

export async function reportUgcContent(input: {
  contentType: UgcContentType;
  contentId: string;
  reason: UgcReportReason;
  surface: string;
}) {
  const { data, error } = await (supabase.rpc as any)('rpc_submit_ugc_content_report_v1', {
    p_content_type: input.contentType,
    p_content_id: input.contentId,
    p_reason: input.reason,
    p_client_evidence: { surface: input.surface },
  });
  if (error) throw error;
  return String(data);
}
