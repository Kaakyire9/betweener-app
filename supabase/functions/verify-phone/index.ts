// @ts-nocheck -- Supabase Edge runtime supplies Deno and remote imports.
import { createPhoneAdmin, phoneJson, phonePreflight } from '../_shared/phone-verification-runtime.ts';
import {
  getPhoneVerifyConfig, isApprovedPhoneCheck, isVerificationSid, normalizeVerificationInput,
  phoneVerificationRateAllowed, resolveVerificationCaller,
} from '../_shared/phone-verification-boundary.ts';

function phoneCheckResult(result: { state?: string; confidence_score?: number; recovery_token?: string }, phone: string) {
  if (result?.state === 'verified') {
    return phoneJson({ success: true, verified: true, valid: true, status: 'approved', confidenceScore: result.confidence_score });
  }
  if (result?.state === 'conflict' && result.recovery_token) {
    return phoneJson({
      error: 'This number already belongs to an older Betweener account.',
      code: 'phone_belongs_to_existing_account', phoneNumber: phone, recoveryToken: result.recovery_token,
    }, 409);
  }
  if (result?.state === 'pending') {
    return phoneJson({ success: false, verified: false, valid: false, status: 'pending' });
  }
  if (result?.state === 'busy') {
    return phoneJson({ error: 'A verification is already in progress. Please wait and try again.' }, 429);
  }
  if (result?.state === 'account_unavailable') {
    return phoneJson({ error: 'Phone verification cannot be changed for this account.' }, 409);
  }
  return phoneJson({ error: 'This verification attempt has expired. Request a new code.', code: 'challenge_expired' }, 409);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return phonePreflight();
  if (req.method !== 'POST') return phoneJson({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => null);
    const input = body && normalizeVerificationInput(body);
    const code = typeof body?.verificationCode === 'string' ? body.verificationCode.trim() : '';
    if (!input || !/^\d{4,10}$/.test(code)) {
      return phoneJson({ error: 'A valid phone number, signup attempt, and code are required.' }, 400);
    }

    const admin = createPhoneAdmin();
    const caller = await resolveVerificationCaller(req, token => admin.auth.getUser(token), body.userId);
    if (caller.status !== 200) {
      return phoneJson({ error: 'Sign in to verify your phone.', code: 'sign_in_required' }, caller.status);
    }
    const daily = Deno.env.get('ENVIRONMENT') !== 'development';
    if (!await phoneVerificationRateAllowed(admin.rpc.bind(admin), req, 'check', caller.userId, input.phone, daily)) {
      return phoneJson({ error: 'Too many attempts. Please wait and try again.' }, 429);
    }

    const twilio = getPhoneVerifyConfig(name => Deno.env.get(name));
    if (!twilio) return phoneJson({ error: 'Phone verification is temporarily unavailable.' }, 503);
    const { data: challenge, error } = await admin.rpc('rpc_begin_phone_check_v1', {
      p_user_id: caller.userId, p_signup_session_id: input.signupSessionId, p_phone: input.phone,
    });
    if (error) return phoneJson({ error: 'Unable to read verification status.' }, 503);
    if (challenge?.state !== 'check' || !isVerificationSid(challenge.verification_sid)) {
      return phoneCheckResult(challenge, input.phone);
    }

    const response = await fetch(twilio.base + '/VerificationCheck', {
      method: 'POST',
      headers: { Authorization: twilio.authorization, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ VerificationSid: challenge.verification_sid, Code: code }),
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 404) {
      const { error: expireError } = await admin.rpc('rpc_expire_phone_challenge_v1', {
        p_user_id: caller.userId, p_id: challenge.id, p_check_id: challenge.check_id,
        p_sid: challenge.verification_sid,
      });
      if (expireError) return phoneJson({ error: 'Unable to restart this verification attempt.' }, 503);
      return phoneCheckResult({ state: 'missing' }, input.phone);
    }
    const provider = await response.json().catch(() => null);
    const approved = response.ok && !!provider &&
      isApprovedPhoneCheck(provider, challenge.verification_sid, input.phone);

    const { data: result, error: finishError } = await admin.rpc('rpc_finish_phone_check_v1', {
      p_user_id: caller.userId, p_id: challenge.id, p_check_id: challenge.check_id,
      p_sid: challenge.verification_sid, p_approved: approved,
    });
    if (finishError) return phoneJson({ error: 'Unable to save the verification result.' }, 503);
    if (!response.ok && result?.state === 'pending') {
      return phoneJson({ error: 'Unable to verify the code. Please try again.' }, 502);
    }
    return phoneCheckResult(result, input.phone);
  } catch {
    return phoneJson({ error: 'Phone verification is temporarily unavailable.' }, 503);
  }
});
