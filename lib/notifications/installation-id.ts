/** Push registration and Connect must not create different installation IDs concurrently. */
export function createInstallationIdLookup(load: (applicationId: string) => Promise<string>) {
  const pending = new Map<string, Promise<string>>();
  return (applicationId: string): Promise<string> => {
    const existing = pending.get(applicationId);
    if (existing) return existing;
    const operation = Promise.resolve().then(() => load(applicationId));
    pending.set(applicationId, operation);
    void operation.finally(() => { if (pending.get(applicationId) === operation) pending.delete(applicationId); }).catch(() => undefined);
    return operation;
  };
}
