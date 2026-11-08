import type { StudioOperationalSnapshot } from '@betweener/live-program-domain';
import { useState } from 'react';

import { StudioPreflightPanel } from '../operations/StudioPreflightPanel.tsx';

const snapshot = {
  schemaVersion: 1,
  serverNow: new Date(0).toISOString(),
  access: { canView: true, canControl: true, canPublish: true, canScreenShare: true,
    canUseExternalAudio: true, canModerate: false },
  session: { id: '11111111-1111-4111-8111-111111111111', title: 'E2E Studio',
    status: 'backstage', version: 1, ownershipType: 'human', systemSessionKind: null },
  sources: [],
} as unknown as StudioOperationalSnapshot;

export function StudioPreflightHarness() {
  const [ready, setReady] = useState(false);
  return <main className="auth-shell"><div className="auth-card stack-md">
    <span className="eyebrow">E2E MEDIA HARNESS</span>
    <StudioPreflightPanel sessionId={snapshot.session.id} snapshot={snapshot}
      onReadyChange={setReady} />
    <output data-testid="preflight-result">{ready ? 'ready' : 'not-ready'}</output>
  </div></main>;
}
