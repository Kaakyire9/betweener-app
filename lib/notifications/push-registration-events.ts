const listeners = new Set<(userId: string, installationId: string) => void>();
export function subscribePushRegistrations(listener: (userId: string, installationId: string) => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function notifyPushRegistration(userId: string, installationId: string) {
  for (const listener of [...listeners]) { try { listener(userId, installationId); } catch { /* Registration remains independent. */ } }
}
