import { getJwtSessionBinding } from './session-token.ts';

export interface NativeSessionSnapshot { authenticated: true; userId: string; generation: string }
export interface NativeSessionOwner {
  snapshot(): NativeSessionSnapshot | null;
  subscribe(listener: () => void): () => void;
  accessToken(expected: NativeSessionSnapshot): string;
}
type Session = { user: { id: string }; access_token: string };

/** Local lifecycle fence fed only by AuthProvider, never an admission authority. */
export function createNativeSessionOwner(now = Date.now) {
  let epoch = 0, token = '', sessionId = '', expires = 0;
  let current: NativeSessionSnapshot | null = null;
  const retiredSessions = new Set<string>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Other privacy owners must still retire. */ } } };
  const invalidate = () => { if (sessionId) retiredSessions.add(sessionId); ++epoch; token = ''; sessionId = ''; expires = 0; current = null; notify(); };
  const snapshot = () => current && expires > now() + 30_000 ? current : null;
  const owner: NativeSessionOwner = {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    accessToken(expected) {
      const live = snapshot();
      if (!live || live.userId !== expected.userId || live.generation !== expected.generation) throw new Error('connect_unauthenticated');
      return token;
    },
  };
  return { owner, invalidate,
    accept(session: Session | null) {
      const binding = getJwtSessionBinding(session?.access_token);
      if (!session || !binding || retiredSessions.has(binding.sessionId) || binding.userId !== session.user.id || binding.expiresAt <= now() + 30_000) { invalidate(); return; }
      const changed = !snapshot() || current?.userId !== binding.userId || sessionId !== binding.sessionId;
      if (sessionId && sessionId !== binding.sessionId) retiredSessions.add(sessionId);
      if (sessionId && sessionId !== binding.sessionId) retiredSessions.add(sessionId);
      token = session.access_token; expires = binding.expiresAt; sessionId = binding.sessionId;
      if (changed) { current = Object.freeze({ authenticated: true, userId: binding.userId, generation: `auth-epoch-${++epoch}` }); notify(); }
    },
  };
}
