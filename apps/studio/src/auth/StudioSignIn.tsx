import { type FormEvent, useState } from 'react';

import { errorMessage } from '../lib/errors.ts';

export function StudioSignIn({
  onSignIn,
  onGoogleSignIn,
  onMagicLinkSignIn,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onMagicLinkSignIn: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onSignIn(email.trim(), password);
    } catch (failure) {
      setError(errorMessage(failure, 'Sign in failed.'));
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onGoogleSignIn();
    } catch (failure) {
      setError(errorMessage(failure, 'Google sign-in failed.'));
      setBusy(false);
    }
  };

  const sendMagicLink = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Enter your staging account email first.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onMagicLinkSignIn(normalizedEmail);
      setNotice('Secure sign-in link sent. Open it in this browser to continue.');
    } catch (failure) {
      setError(errorMessage(failure, 'Could not send the secure sign-in link.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="studio-sign-in-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">B</span>
          <div><strong>BETWEENER</strong><span>STUDIO</span></div>
        </div>
        <p className="eyebrow">PRIVATE PRODUCTION CONSOLE</p>
        <h1 id="studio-sign-in-title">Direct the room, thoughtfully.</h1>
        <p className="muted">Sign in with an approved Host or producer account.</p>
        <button className="button button-secondary studio-provider-button" disabled={busy}
          type="button" onClick={() => void continueWithGoogle()}>
          Continue with Google
        </button>
        <div className="auth-separator" aria-hidden="true"><span>or use email</span></div>
        <form onSubmit={submit} className="auth-form">
          <label>Email<input autoComplete="email" inputMode="email" required type="email"
            value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password"
            value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <p className="error-banner" role="alert">{error}</p> : null}
          {notice ? <p className="success-banner" role="status">{notice}</p> : null}
          <button className="button button-primary" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Open Studio'}
          </button>
          <button className="text-button studio-magic-link" disabled={busy} type="button"
            onClick={() => void sendMagicLink()}>
            Email me a secure sign-in link
          </button>
        </form>
      </section>
    </main>
  );
}
