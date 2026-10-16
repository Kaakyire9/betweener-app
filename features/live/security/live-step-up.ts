import { supabase } from '@/lib/supabase';

export type LiveStepUpPreparation =
  | { kind: 'satisfied' }
  | {
      kind: 'challenge';
      factorId: string;
      challengeId: string;
    }
  | {
      kind: 'enrollment';
      factorId: string;
      challengeId: string;
      qrCode: string;
      secret: string;
      uri: string;
    };

const challengeFactor = async (factorId: string) => {
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error) throw new Error(error.message || 'live_step_up_challenge_failed');
  return data.id;
};
export const prepareLiveStepUp = async (): Promise<LiveStepUpPreparation> => {
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new Error(assuranceError.message || 'live_step_up_assurance_unavailable');
  }
  if (assurance.currentLevel === 'aal2') return { kind: 'satisfied' };

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw new Error(factorsError.message || 'live_step_up_factors_unavailable');
  const verified = factors.totp.find((factor) => factor.status === 'verified');
  if (verified) {
    return {
      kind: 'challenge',
      factorId: verified.id,
      challengeId: await challengeFactor(verified.id),
    };
  }

  await Promise.all(factors.totp
    .filter((factor) => factor.status !== 'verified')
    .map(async (factor) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw new Error(error.message || 'live_step_up_cleanup_failed');
    }));

  const friendlyName = `Betweener Live ${new Date().toISOString().slice(0, 10)}`;
  const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (enrollmentError) {
    throw new Error(enrollmentError.message || 'live_step_up_enrollment_failed');
  }

  return {
    kind: 'enrollment',
    factorId: enrollment.id,
    challengeId: await challengeFactor(enrollment.id),
    qrCode: enrollment.totp.qr_code,
    secret: enrollment.totp.secret,
    uri: enrollment.totp.uri,
  };
};

export const verifyLiveStepUp = async (
  preparation: Exclude<LiveStepUpPreparation, { kind: 'satisfied' }>,
  code: string,
): Promise<void> => {
  const normalizedCode = code.replace(/\D/g, '').slice(0, 6);
  if (normalizedCode.length !== 6) throw new Error('live_step_up_code_invalid');

  const { error } = await supabase.auth.mfa.verify({
    factorId: preparation.factorId,
    challengeId: preparation.challengeId,
    code: normalizedCode,
  });
  if (error) throw new Error(error.message || 'live_step_up_verify_failed');
};

export const liveStepUpErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('code_invalid') || message.toLowerCase().includes('invalid')) {
    return 'Enter the current six-digit code from your authenticator app.';
  }
  if (message.toLowerCase().includes('expired')) {
    return 'That verification expired. Close this sheet and try again.';
  }
  return 'Authenticator verification could not be completed. Please try again.';
};
