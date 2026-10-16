import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

import { StudioSignIn } from './auth/StudioSignIn.tsx';
import { useStudioAuth } from './auth/use-studio-auth.ts';
import { useStudioSessions } from './hooks/use-studio-sessions.ts';
import { studioControllerInstanceId } from './hooks/use-controller-lease.ts';
import { StudioMfaGate } from './security/StudioMfaGate.tsx';
import { StudioSessionPicker } from './sessions/StudioSessionPicker.tsx';

const StudioWorkspace = lazy(async () => import('./workspace/StudioWorkspace.tsx').then((module) => ({
  default: module.StudioWorkspace,
})));
const StudioPreflightHarness = import.meta.env.DEV
  ? lazy(async () => import('./e2e/StudioPreflightHarness.tsx').then((module) => ({
    default: module.StudioPreflightHarness,
  })))
  : null;

const sessionFromLocation = () => new URL(window.location.href).searchParams.get('session');

function StudioRuntime() {
  const auth = useStudioAuth();
  const sessions = useStudioSessions();
  const [sessionId, setSessionId] = useState<string | null>(sessionFromLocation);
  const controllerInstanceId = useMemo(studioControllerInstanceId, []);

  useEffect(() => {
    const onPopState = () => setSessionId(sessionFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToSession = (nextSessionId: string | null) => {
    const url = new URL(window.location.href);
    if (nextSessionId) url.searchParams.set('session', nextSessionId);
    else url.searchParams.delete('session');
    window.history.pushState(null, '', url);
    setSessionId(nextSessionId);
  };

  if (auth.loading) {
    return <main className="workspace-loading"><div className="loading-panel">Opening Studio...</div></main>;
  }
  if (!auth.session) {
    return <StudioSignIn onSignIn={auth.signIn} onGoogleSignIn={auth.signInWithGoogle}
      onMagicLinkSignIn={auth.sendMagicLink} />;
  }
  return <StudioMfaGate onSignOut={auth.signOut}>
    {sessionId ? (
      <Suspense fallback={<main className="workspace-loading"><div className="loading-panel">Preparing production desk...</div></main>}>
        <StudioWorkspace sessionId={sessionId} controllerInstanceId={controllerInstanceId}
          onBack={() => navigateToSession(null)} />
      </Suspense>
    ) : (
      <>
        <button className="sign-out-button" onClick={() => void auth.signOut()}>Sign out</button>
        <StudioSessionPicker sessions={sessions.sessions} loading={sessions.loading}
          error={sessions.error} onOpen={(id) => navigateToSession(id)}
          onRefresh={() => void sessions.refresh()} />
      </>
    )}
  </StudioMfaGate>;
}

export default function App() {
  const e2eHarness = import.meta.env.DEV
    && new URL(window.location.href).searchParams.get('e2eHarness') === 'preflight';
  return e2eHarness && StudioPreflightHarness
    ? <Suspense fallback={null}><StudioPreflightHarness /></Suspense>
    : <StudioRuntime />;
}
