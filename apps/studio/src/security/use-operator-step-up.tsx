import { useCallback, useState } from 'react';

import { supabase } from '../lib/supabase.ts';

type PendingOperation = {
  label: string;
  factorId: string;
  operation: () => Promise<void>;
};

export function useOperatorStepUp() {
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const runWithStepUp = useCallback(async (
    label: string,
    operation: () => Promise<void>,
  ) => {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.currentLevel === 'aal2') {
      await operation();
      return;
    }
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const factor = factors.totp.find((candidate) => candidate.status === 'verified');
    if (!factor) throw new Error(
      'A verified authenticator is required. Enrol MFA in your Betweener account before operating Studio.',
    );
    setCode('');
    setError(null);
    setPending({ label, factorId: factor.id, operation });
  }, []);

  const cancel = () => {
    if (verifying) return;
    setPending(null);
    setCode('');
    setError(null);
  };

  const verify = async () => {
    if (!pending || !/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your authenticator.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pending.factorId,
        code,
      });
      if (verifyError) throw verifyError;
      const operation = pending.operation;
      setPending(null);
      setCode('');
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Step-up verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const stepUpDialog = pending ? (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true"
        aria-labelledby="step-up-title">
        <span className="eyebrow">SECURITY CHECK</span>
        <h2 id="step-up-title">Confirm {pending.label}</h2>
        <p className="notice-copy">
          Enter the current code from your authenticator. This protects the live audience
          from an unattended or compromised operator session.
        </p>
        <label className="field-label">Authenticator code
          <input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
            value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => { if (event.key === 'Enter') void verify(); }} />
        </label>
        {error ? <p className="error-copy" role="alert">{error}</p> : null}
        <div className="button-row modal-actions">
          <button className="button button-quiet" disabled={verifying} onClick={cancel}>Cancel</button>
          <button className="button button-primary" disabled={verifying || code.length !== 6}
            onClick={() => void verify()}>{verifying ? 'Verifying…' : 'Verify and continue'}</button>
        </div>
      </section>
    </div>
  ) : null;

  return { runWithStepUp, stepUpDialog, stepUpPending: pending !== null };
}
