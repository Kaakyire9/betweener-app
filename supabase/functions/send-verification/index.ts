// @ts-nocheck -- Supabase Edge runtime supplies Deno and remote imports.
import { createPhoneAdmin, phoneJson, phonePreflight } from '../_shared/phone-verification-runtime.ts';
import {
  getPhoneVerifyConfig, isVerificationSid, normalizeVerificationInput,
  phoneVerificationRateAllowed, resolveVerificationCaller,
} from '../_shared/phone-verification-boundary.ts';

function phoneConfidenceScore(phone: string, carrier?: { name?: string; type?: string }) {
  const ghanaMobile = /^\+233(?:20|23|24|26|27|28|50|54|55|56|57|59)/.test(phone);
  const prefixScore = ghanaMobile ? 40 : phone.startsWith('+233') ? 25 : 15;
  return prefixScore + 20 + (carrier?.name ? 10 : 0) + (carrier?.type === 'mobile' ? 15 : 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return phonePreflight();
  if (req.method !== 'POST') return phoneJson({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => null);
    const input = body && normalizeVerificationInput(body);
    if (!input) return phoneJson({ error: 'A valid phone number and signup attempt are required.' }, 400);

    const admin = createPhoneAdmin();
    const caller = await resolveVerificationCaller(req, token => admin.auth.getUser(token), body.userId);
    if (caller.status !== 200) {
      return phoneJson({ error: 'Sign in to verify your phone.', code: 'sign_in_required' }, caller.status);
    }

    const twilio = getPhoneVerifyConfig(name => Deno.env.get(name));
    if (!twilio) return phoneJson({ error: 'Phone verification is temporarily unavailable.' }, 503);
    const daily = Deno.env.get('ENVIRONMENT') !== 'development';
    if (!await phoneVerificationRateAllowed(admin.rpc.bind(admin), req, 'send', caller.userId, input.phone, daily)) {
      return phoneJson({ error: 'Too many attempts. Please wait and try again.' }, 429);
    }

    const { data: reservation, error } = await admin.rpc('rpc_reserve_phone_challenge_v1', {
      p_user_id: caller.userId, p_signup_session_id: input.signupSessionId, p_phone: input.phone,
    });
    if (error) return phoneJson({ error: 'Unable to start verification.' }, 503);
    if (reservation?.state === 'busy') {
      return phoneJson({ error: 'A verification is already in progress. Please wait and try again.' }, 429);
    }
    if (reservation?.state === 'complete') {
      return phoneJson({ error: 'This verification is complete. Submit the code you already used to continue.' }, 409);
    }
    if (reservation?.state !== 'send') return phoneJson({ error: 'Unable to start verification.' }, 400);

    const response = await fetch(twilio.base + '/Verifications', {
      method: 'POST',
      headers: { Authorization: twilio.authorization, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: input.phone, Channel: 'sms', Locale: 'en' }),
      signal: AbortSignal.timeout(12000),
    });
    const provider = await response.json().catch(() => null);
    if (!response.ok || !isVerificationSid(provider?.sid) || provider?.to !== input.phone ||
        provider?.status !== 'pending') {
      return phoneJson({ error: 'Unable to send a verification code. Please try again.' }, 502);
    }

    const carrier = provider.lookup?.carrier;
    const { data: stored, error: storeError } = await admin.rpc('rpc_record_phone_dispatch_v1', {
      p_user_id: caller.userId, p_id: reservation.id, p_dispatch_id: reservation.dispatch_id,
      p_sid: provider.sid, p_score: phoneConfidenceScore(input.phone, carrier),
    });
    if (storeError || stored !== true) {
      return phoneJson({ error: 'Unable to bind this verification attempt. Please wait before requesting a new code.' }, 409);
    }

    return phoneJson({ success: true, stored: true, phoneNumber: input.phone, carrierInfo: carrier });
  } catch {
    return phoneJson({ error: 'Phone verification is temporarily unavailable.' }, 503);
  }
});
