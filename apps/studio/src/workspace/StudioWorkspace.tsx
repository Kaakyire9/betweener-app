import {
  buildStudioTakeCommand,
  previewFromProgram,
  reduceProgramPreview,
  requiredSlotsForScene,
  type ProgramPreviewAction,
  type ProgramPreviewState,
  type ProgramScene,
  type ProgramSourceSlot,
  type ProgramTargetCanvas,
  type ProgramTransition,
} from '@betweener/live-program-domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { studioApi, type StudioPublicationControl } from '../api/studio-api.ts';
import { useControllerLease } from '../hooks/use-controller-lease.ts';
import { useOperatorConsole } from '../hooks/use-operator-console.ts';
import { useStudioSnapshot } from '../hooks/use-studio-snapshot.ts';
import { errorMessage, friendlyReason } from '../lib/errors.ts';
import { studioReleaseProvenance } from '../lib/release-provenance.ts';
import { StudioDjSource } from '../media/StudioDjSource.tsx';
import { StudioMediaControls } from '../media/StudioMediaControls.tsx';
import { StudioMediaProvider } from '../media/studio-media-context.tsx';
import { OperationalPanels } from '../panels/OperationalPanels.tsx';
import { HostAndRuntimePanel } from '../panels/HostAndRuntimePanel.tsx';
import { StudioTeamPanel } from '../panels/StudioTeamPanel.tsx';
import { OperatorSafetyPanel } from '../operations/OperatorSafetyPanel.tsx';
import { PrivateOperationsChannel } from '../operations/PrivateOperationsChannel.tsx';
import { RunOfShowPanel } from '../operations/RunOfShowPanel.tsx';
import { StudioPreflightPanel } from '../operations/StudioPreflightPanel.tsx';
import { ProgramRenderer } from '../program/ProgramRenderer.tsx';
import {
  AdaptiveStageM2PreviewCanvas,
  AdaptiveStageM2PreviewControls,
  useAdaptiveStageM2Review,
} from '../program/AdaptiveStageM2Preview.tsx';
import { isAdaptiveStageM2StudioPreviewEnabled } from '../program/adaptive-stage-m2-preview-flags.ts';
import { assignmentsForScene, SceneLibrary } from '../program/SceneLibrary.tsx';
import { assignmentsContainTerminalSource } from '../program/source-assignments.ts';
import {
  adaptiveStageV2StudioFlags,
  resolveStudioAdaptiveStageShadow,
} from '../program/adaptive-stage-shadow.ts';
import { useOperatorStepUp } from '../security/use-operator-step-up.tsx';
import { ModeratorWorkspace } from './ModeratorWorkspace.tsx';

export function StudioWorkspace({
  sessionId,
  controllerInstanceId,
  onBack,
}: {
  sessionId: string;
  controllerInstanceId: string;
  onBack: () => void;
}) {
  const { snapshot, setSnapshot, loading, error: loadError, refresh } = useStudioSnapshot(sessionId);
  const [preview, setPreview] = useState<ProgramPreviewState | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preflightReady, setPreflightReady] = useState(false);
  const [publicationControl, setPublicationControl] = useState<StudioPublicationControl | null>(null);
  const [m2ReviewActive, setM2ReviewActive] = useState(false);
  const lastShadowKey = useRef<string | null>(null);
  const stepUp = useOperatorStepUp();
  const m2Review = useAdaptiveStageM2Review(
    snapshot?.sources ?? [],
    preview?.sourceAssignments ?? {},
  );

  useEffect(() => {
    if (!snapshot) return;
    setPreview((current) => {
      if (!current
        || (!current.dirty && current.baseProgramVersion !== snapshot.program.programVersion)
        || (current.dirty
          && assignmentsContainTerminalSource(current.sourceAssignments, snapshot.sources))) {
        return previewFromProgram(snapshot.program);
      }
      return current;
    });
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || !adaptiveStageV2StudioFlags.shadow) return;
    const shadow = resolveStudioAdaptiveStageShadow(snapshot);
    const key = `${snapshot.program.programVersion}:${shadow.plan?.planHash ?? shadow.events[0]?.details.reason_code ?? 'error'}`;
    if (lastShadowKey.current === key) return;
    lastShadowKey.current = key;
    shadow.events.forEach((event) => {
      void studioApi.recordAdaptiveStageDiagnostic(sessionId, event.name, {
        ...event.details,
        ...studioReleaseProvenance,
      })
        .catch(() => undefined);
    });
  }, [sessionId, snapshot]);

  useEffect(() => {
    let active = true;
    void studioApi.getPublicationControl(sessionId).then((control) => {
      if (active) setPublicationControl(control);
    }).catch((failure) => {
      if (active) setCommandError(errorMessage(failure, 'Publication authority unavailable.'));
    });
    return () => { active = false; };
  }, [sessionId]);

  const onLeaseLost = useCallback(() => {
    setCommandError('This tab no longer owns programme control. Preview was kept locally.');
    void refresh();
  }, [refresh]);
  const onLeaseRenewed = useCallback(() => { void refresh(); }, [refresh]);
  const lease = useControllerLease({
    snapshot,
    controllerInstanceId,
    onLeaseLost,
    onLeaseRenewed,
  });
  const operatorConsole = useOperatorConsole(sessionId, controllerInstanceId, lease.ownsControl);

  const mutatePreview = (action: ProgramPreviewAction) => {
    if (!snapshot) return;
    setPreview((current) => reduceProgramPreview(
      current ?? previewFromProgram(snapshot.program),
      action,
    ));
  };

  const run = async (name: string, operation: () => Promise<void>) => {
    setBusy(name);
    setCommandError(null);
    try { await operation(); }
    catch (failure) { setCommandError(errorMessage(failure, `${name} failed.`)); }
    finally { setBusy(null); }
  };

  const takeControl = () => run('Take Control', async () => {
    if (!snapshot) return;
    const result = await studioApi.takeControl({
      sessionId,
      controllerInstanceId,
      expectedControllerGeneration: snapshot.program.controller.generation,
      expectedProgramVersion: snapshot.program.programVersion,
      commandId: crypto.randomUUID(),
    });
    setSnapshot(result.snapshot);
    if (!result.applied) throw new Error(result.reasonCode);
    setPreview(previewFromProgram(result.snapshot.program));
  });

  const takeProgram = (cut: boolean) => run(cut ? 'Cut' : 'Take', async () => {
    if (!snapshot || !preview) return;
    const missing = requiredSlotsForScene(preview.scene)
      .filter((slot) => !preview.sourceAssignments[slot]);
    if (missing.length) throw new Error(`Assign ${missing.join(', ')} before TAKE.`);
    const result = await studioApi.takeProgram(buildStudioTakeCommand({
      commandId: crypto.randomUUID(),
      sessionId,
      controllerInstanceId,
      preview,
      cut,
    }));
    setSnapshot(result.snapshot);
    if (!result.applied) throw new Error(result.reasonCode);
    setPreview(previewFromProgram(result.snapshot.program));
  });
  const secureTakeProgram = (cut: boolean) => stepUp.runWithStepUp(
    cut ? 'CUT' : 'TAKE',
    () => takeProgram(cut),
  ).catch((failure) => setCommandError(errorMessage(failure, 'Step-up failed.')));

  const resumeOdo = () => run('Resume Odo', async () => {
    if (!snapshot) return;
    const result = await studioApi.resumeOdo({
      sessionId,
      controllerInstanceId,
      expectedControllerGeneration: snapshot.program.controller.generation,
      commandId: crypto.randomUUID(),
    });
    setSnapshot(result.snapshot);
    if (!result.applied) throw new Error(result.reasonCode);
    setPreview(previewFromProgram(result.snapshot.program));
  });

  const startLive = () => run('Start Live', async () => {
    if (!preflightReady) throw new Error('Complete the Studio preflight before publishing.');
    const next = await studioApi.startSession(sessionId);
    setSnapshot(next);
    setPreview(previewFromProgram(next.program));
  });
  const claimStudioPublication = () => stepUp.runWithStepUp('Use Studio control', () =>
    run('Use Studio control', async () => {
      const current = publicationControl ?? await studioApi.getPublicationControl(sessionId);
      const next = await studioApi.setBroadcastAuthority(
        sessionId,
        current.version,
        'studio_producer',
      );
      setPublicationControl(next);
    })).catch((failure) => setCommandError(errorMessage(failure, 'Step-up failed.')));
  const endLive = () => run('End Live', async () => {
    if (!window.confirm('End this Live for everyone? Current connections will close safely.')) return;
    await studioApi.endSession(sessionId);
    await refresh();
  });
  const secureStartLive = () => stepUp.runWithStepUp('Start Live', startLive)
    .catch((failure) => setCommandError(errorMessage(failure, 'Step-up failed.')));
  const secureEndLive = () => stepUp.runWithStepUp('End Live', endLive)
    .catch((failure) => setCommandError(errorMessage(failure, 'Step-up failed.')));
  const emergencySafeScene = () => run('Emergency safe scene', async () => {
    const result = await studioApi.emergencySafeScene(sessionId, 'operator_emergency');
    setSnapshot(result.snapshot);
    setPreview(previewFromProgram(result.snapshot.program));
  });
  const acknowledgeAlert = (id: number) => run('Acknowledge alert', async () => {
    await studioApi.acknowledgeAlert(sessionId, id);
    await operatorConsole.refresh();
  });

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (m2ReviewActive || !lease.ownsControl || event.key !== 'Enter' || !event.ctrlKey) return;
      event.preventDefault();
      void secureTakeProgram(event.shiftKey);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [lease.ownsControl, m2ReviewActive, secureTakeProgram]);

  const controllerLabel = useMemo(() => snapshot
    ? friendlyReason(snapshot.program.controller.source) : 'Loading', [snapshot]);

  if (loading || !snapshot || !preview) {
    return <main className="workspace-loading"><button className="text-button" onClick={onBack}>← Sessions</button>
      <div className="loading-panel">Loading authoritative programme…</div>
      {loadError ? <p className="error-banner">{loadError}</p> : null}</main>;
  }

  const stalePreview = preview.dirty && (
    preview.baseProgramVersion !== snapshot.program.programVersion
    || preview.baseControllerGeneration !== snapshot.program.controller.generation
  );
  const isModeratorWorkspace = snapshot.access.canModerate
    && !snapshot.access.canControl
    && !snapshot.access.canPublish;
  const isOnAir = snapshot.session.status === 'live';
  const monitorCanConnect = ['backstage', 'live', 'ending'].includes(snapshot.session.status);

  return (
    <StudioMediaProvider sessionId={sessionId} controllerInstanceId={controllerInstanceId}
      sourceKind={isModeratorWorkspace ? 'program_monitor' : 'studio_host'}
      autoConnect={isModeratorWorkspace && monitorCanConnect}>
      <main className="studio-workspace">
        <header className={`studio-toolbar ${isOnAir ? 'is-on-air' : ''}`}>
          <div className="toolbar-brand"><button className="icon-button" onClick={onBack} aria-label="Back to sessions">←</button>
            <div><span className="eyebrow">BETWEENER STUDIO</span><strong>{snapshot.session.title}</strong></div></div>
          <div className="toolbar-status"><span className={`status-dot ${isOnAir ? 'on-air' : 'healthy'}`} />
            <span>{friendlyReason(snapshot.session.status)}</span><span className="divider" />
            <span>Controller: <strong>{controllerLabel}</strong></span>
            {lease.renewing ? <small>renewing</small> : null}
            {isModeratorWorkspace ? <span className="status-pill workspace-mode">Moderator</span> : null}
            {isOnAir ? <span className="on-air-tally">ON AIR</span> : null}</div>
          <div className="toolbar-actions">
            {snapshot.access.canPublish
              && publicationControl?.canSetAuthority === true
              && publicationControl?.broadcastAuthority === 'mobile_host'
              && !['live', 'ending', 'ended'].includes(snapshot.session.status)
              ? <button className="button button-secondary" disabled={busy !== null}
                onClick={() => void claimStudioPublication()}>Use Studio control</button> : null}
            {snapshot.access.canPublish && snapshot.session.status !== 'live' && snapshot.session.ownershipType === 'human'
              && publicationControl?.broadcastAuthority === 'studio_producer'
              ? <button className="button button-secondary" disabled={busy !== null}
                onClick={() => void secureStartLive()}>Start Live</button> : null}
            {snapshot.access.canControl && !lease.ownsControl
              ? <button className="button button-primary" disabled={busy !== null}
                onClick={() => void takeControl()}>Take Control</button> : null}
            {lease.ownsControl ? <button className="button button-secondary" disabled={busy !== null}
              onClick={() => void resumeOdo()}>Resume Odo</button> : null}
            {snapshot.access.canPublish && snapshot.session.status === 'live' && snapshot.session.ownershipType === 'human'
              ? <button className="button button-danger" disabled={busy !== null}
                onClick={() => void secureEndLive()}>End Live</button> : null}
          </div>
        </header>

        {(loadError || commandError) ? <div className="workspace-alert" role="alert">
          {loadError || commandError}<button onClick={() => { setCommandError(null); void refresh(); }}>Refresh</button>
        </div> : null}
        {!isModeratorWorkspace && stalePreview ? <div className="workspace-alert warning" role="status">
          Program changed after this Preview was prepared.
          <button onClick={() => setPreview(previewFromProgram(snapshot.program))}>Sync Preview</button>
        </div> : null}

        {isModeratorWorkspace ? <ModeratorWorkspace
          sessionId={sessionId}
          snapshot={snapshot}
          consoleState={operatorConsole.consoleState}
          consoleError={operatorConsole.error}
          busy={busy !== null}
          onEmergency={() => void emergencySafeScene()}
          onAcknowledge={(id) => void acknowledgeAlert(id)}
          onConsoleChanged={operatorConsole.refresh}
        /> : <div className="studio-grid" data-testid="producer-workspace">
          <aside className="left-rail stack-md">
            <section className="panel">
              <div className="section-heading"><div><span className="eyebrow">SOURCES</span><h2>Media desk</h2></div>
                <span className="status-pill">{snapshot.sources.filter((source) => source.readiness === 'live').length} live</span></div>
              <StudioMediaControls snapshot={snapshot} controllerInstanceId={controllerInstanceId}
                onChanged={() => void refresh()} authorizePublish={stepUp.runWithStepUp} />
              <StudioDjSource snapshot={snapshot} controllerInstanceId={controllerInstanceId}
                onChanged={() => void refresh()} authorizePublish={stepUp.runWithStepUp} />
              <div className="source-list">
                {snapshot.sources.map((source) => <div className="source-row" key={source.id}>
                  <span className={`status-dot ${source.health}`} /><div><strong>{source.key}</strong>
                    <small>{friendlyReason(source.type)} · {source.readiness}</small></div>
                </div>)}
              </div>
            </section>
            <StudioPreflightPanel sessionId={sessionId} snapshot={snapshot}
              onReadyChange={setPreflightReady} />
          </aside>

          <section className="production-desk stack-md">
            <div className="monitor-grid">
              <section className={`monitor-card preview-monitor ${m2ReviewActive ? 'm2-preview-monitor' : ''}`}>
                <div className="monitor-header">
                  <div><span className="eyebrow">{m2ReviewActive ? 'PREVIEW · M2 INTERNAL' : 'PREVIEW'}</span>
                    <strong>{m2ReviewActive ? 'Design review only' : 'Local to this tab'}</strong></div>
                  <div className="monitor-actions">
                    {isAdaptiveStageM2StudioPreviewEnabled ? <button className="text-button m2-mode-toggle"
                      onClick={() => setM2ReviewActive((current) => !current)}>
                      {m2ReviewActive ? 'Return to current Preview' : 'Open M2 Preview'}
                    </button> : null}
                    <span className={`status-pill ${m2ReviewActive || preview.dirty ? 'changed' : ''}`}>
                      {m2ReviewActive ? 'Internal only' : preview.dirty ? 'Changed' : 'Synced'}
                    </span>
                  </div>
                </div>
                {m2ReviewActive
                  ? <AdaptiveStageM2PreviewCanvas review={m2Review} />
                  : <ProgramRenderer state={preview} sources={snapshot.sources} label="Studio Preview" />}
              </section>
              <section className={`monitor-card program-monitor ${isOnAir ? 'is-on-air' : ''}`}><div className="monitor-header">
                <div><span className="eyebrow">PROGRAM · CURRENT AUDIENCE OUTPUT</span><strong>Authoritative viewer output</strong></div>
                <span className={`status-pill program-badge ${isOnAir ? 'on-air' : ''}`}>
                  {isOnAir ? 'ON AIR' : 'PROGRAM'} · v{snapshot.program.programVersion}
                </span>
              </div><ProgramRenderer state={snapshot.program} sources={snapshot.sources} label="Audience Program" /></section>
            </div>
            <div className={`take-bar ${m2ReviewActive ? 'is-guarded' : ''}`}>
              <div><strong>{m2ReviewActive ? 'M2 Preview is isolated' : 'Preview → Program'}</strong>
                <small>{m2ReviewActive
                  ? 'TAKE and CUT are unavailable. M2 Program authority is not enabled.'
                  : 'Preview never changes the audience until TAKE or CUT.'}</small></div>
              <div className="button-row"><button className="button button-secondary"
                disabled={m2ReviewActive || !lease.ownsControl || busy !== null || stalePreview}
                onClick={() => void secureTakeProgram(true)}>CUT</button>
                <button className="button take-button"
                  disabled={m2ReviewActive || !lease.ownsControl || busy !== null || !preview.dirty || stalePreview}
                  onClick={() => void secureTakeProgram(false)}>TAKE</button></div>
            </div>
            <section className={`panel ${m2ReviewActive ? 'm2-review-panel' : ''}`}>
              <div className="section-heading"><div><span className="eyebrow">
                {m2ReviewActive ? 'ADAPTIVE STAGE · INTERNAL REVIEW' : 'SCENE LIBRARY'}</span>
                <h2>{m2ReviewActive ? 'Inspect the canonical layout book' : 'Shape the programme'}</h2></div>
                <span className="muted compact">{m2ReviewActive
                  ? 'Preview only · no Program mutation'
                  : 'Ctrl+Enter TAKE · Ctrl+Shift+Enter CUT'}</span></div>
              {m2ReviewActive ? <AdaptiveStageM2PreviewControls review={m2Review} /> : <SceneLibrary preview={preview} sources={snapshot.sources}
                onScene={(scene: ProgramScene) => {
                  setPreview({ ...preview, scene,
                    sourceAssignments: assignmentsForScene(scene, snapshot.sources, preview.sourceAssignments),
                    dirty: true });
                }}
                onAssignment={(slot: ProgramSourceSlot, key: string | null) => mutatePreview({ type: 'assign_source', slot, sourceKey: key })}
                onCanvas={(canvas: ProgramTargetCanvas) => mutatePreview({ type: 'set_canvas', canvas })}
                onTransition={(transition: ProgramTransition) => mutatePreview({ type: 'set_transition', transition })} />}
            </section>
          </section>

          <aside className="right-rail stack-md"><HostAndRuntimePanel sessionId={sessionId} />
            <StudioTeamPanel sessionId={sessionId} authorize={stepUp.runWithStepUp} />
            {operatorConsole.consoleState ? <>
              <OperatorSafetyPanel consoleState={operatorConsole.consoleState}
                canTakeover={snapshot.access.canControl} canModerate={snapshot.access.canModerate}
                ownsControl={lease.ownsControl} busy={busy !== null}
                onTakeover={() => void takeControl()} onEmergency={() => void emergencySafeScene()}
                onAcknowledge={(id) => void acknowledgeAlert(id)} />
              <RunOfShowPanel sessionId={sessionId} consoleState={operatorConsole.consoleState}
                canEdit={snapshot.access.canControl} onChanged={operatorConsole.refresh} />
              <PrivateOperationsChannel sessionId={sessionId}
                consoleState={operatorConsole.consoleState} onChanged={operatorConsole.refresh} />
            </> : null}
            {operatorConsole.error ? <p className="error-copy">{operatorConsole.error}</p> : null}
            <OperationalPanels snapshot={snapshot}
              ownsControl={lease.ownsControl} onChanged={() => void refresh()} /></aside>
        </div>}
        {stepUp.stepUpDialog}
      </main>
    </StudioMediaProvider>
  );
}
