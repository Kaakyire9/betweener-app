import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import { errorMessage } from '../lib/errors.ts';
import { supabase } from '../lib/supabase.ts';

type Enrollment = {
  factorId: string;
  qrCode: string;
};

export function StudioMfaGate({
  children,
  onSignOut,
}: {
  children: ReactNode;
  onSignOut: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) setError(listError.message);
      else setVerified(data.totp.some((factor) => factor.status === 'verified'));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const startEnrollment = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      for (const factor of factors.totp) {
        if (factor.status !== 'verified') {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (unenrollError) throw unenrollError;
        }
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Betweener Studio',
      });
      if (enrollError) throw enrollError;
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code });
      setCode('');
    } catch (failure) {
      setError(errorMessage(failure, 'Authenticator setup could not be started.'));
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrollment = async () => {
    if (!enrollment || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: enrollment.factorId,
      });
      if (unenrollError) throw unenrollError;
      setEnrollment(null);
      setCode('');
    } catch (failure) {
      setError(errorMessage(failure, 'Authenticator setup could not be cancelled safely.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyEnrollment = async (event: FormEvent) => {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your authenticator.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code,
      });
      if (verifyError) throw verifyError;
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== 'aal2') {
        throw new Error('Authenticator verification did not establish an AAL2 session.');
      }
      setEnrollment(null);
      setCode('');
      setVerified(true);
    } catch (failure) {
      setError(errorMessage(failure, 'Authenticator verification failed.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <main className="workspace-loading"><div className="loading-panel">Checking operator security...</div></main>;
  }
  if (verified) return children;

  return (
    <main className="auth-shell">
      <section className="auth-card stack-md" aria-labelledby="studio-mfa-title">
        <div className="brand-lockup compact-lockup">
          <span className="brand-mark" aria-hidden="true">B</span>
          <div><strong>BETWEENER</strong><span>STUDIO SECURITY</span></div>
        </div>
        <p className="eyebrow">OPERATOR PROTECTION</p>
        <h1 id="studio-mfa-title">Secure this console.</h1>
        <p className="muted">
          Studio requires a verified authenticator before TAKE, media publication,
          Start Live or End Live can run.
        </p>

        {enrollment ? (
          <form className="auth-form" onSubmit={verifyEnrollment}>
            <div className="mfa-qr-frame">
              <img src={enrollment.qrCode} alt="QR code for Betweener Studio authenticator setup" />
            </div>
            <p className="notice-copy">
              Scan this once with your authenticator app, then enter its current code.
              Never share or screenshot this QR code.
            </p>
            <label>Authenticator code
              <input autoComplete="one-time-code" inputMode="numeric" maxLength={6}
                pattern="[0-9]{6}" required value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
            </label>
            {error ? <p className="error-banner" role="alert">{error}</p> : null}
            <div className="button-row">
              <button className="button button-quiet" disabled={busy} type="button"
                onClick={() => void cancelEnrollment()}>Cancel setup</button>
              <button className="button button-primary" disabled={busy || code.length !== 6}
                type="submit">{busy ? 'Verifying...' : 'Verify authenticator'}</button>
            </div>
          </form>
        ) : (
          <div className="stack-md">
            <p className="notice-copy">
              Use a password manager or authenticator app that supports time-based one-time codes.
            </p>
            {error ? <p className="error-banner" role="alert">{error}</p> : null}
            <button className="button button-primary" disabled={busy}
              onClick={() => void startEnrollment()}>
              {busy ? 'Preparing...' : 'Set up authenticator'}
            </button>
          </div>
        )}

        <button className="text-button mfa-sign-out" disabled={busy}
          onClick={() => void onSignOut()}>Sign out and use another account</button>
      </section>
    </main>
  );
}
