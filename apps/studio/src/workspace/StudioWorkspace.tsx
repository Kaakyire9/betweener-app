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
import { useCallback, useEffect, useMemo, useState } from 'react';

import { studioApi } from '../api/studio-api.ts';
import { useControllerLease } from '../hooks/use-controller-lease.ts';
import { useStudioSnapshot } from '../hooks/use-studio-snapshot.ts';
import { errorMessage, friendlyReason } from '../lib/errors.ts';
import { StudioDjSource } from '../media/StudioDjSource.tsx';
import { StudioMediaControls } from '../media/StudioMediaControls.tsx';
import { StudioMediaProvider } from '../media/studio-media-context.tsx';
import { OperationalPanels } from '../panels/OperationalPanels.tsx';
import { ProgramRenderer } from '../program/ProgramRenderer.tsx';
import { assignmentsForScene, SceneLibrary } from '../program/SceneLibrary.tsx';

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

  useEffect(() => {
    if (!snapshot) return;
    setPreview((current) => {
      if (!current || (!current.dirty && current.baseProgramVersion !== snapshot.program.programVersion)) {
        return previewFromProgram(snapshot.program);
      }
      return current;
    });
  }, [snapshot]);

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
    const next = await studioApi.startSession(sessionId);
    setSnapshot(next);
    setPreview(previewFromProgram(next.program));
  });
  const endLive = () => run('End Live', async () => {
    if (!window.confirm('End this Live for everyone? Current connections will close safely.')) return;
    await studioApi.endSession(sessionId);
    await refresh();
  });

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!lease.ownsControl || event.key !== 'Enter' || !event.ctrlKey) return;
      event.preventDefault();
      void takeProgram(event.shiftKey);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

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

  return (
    <StudioMediaProvider sessionId={sessionId} controllerInstanceId={controllerInstanceId}>
      <main className="studio-workspace">
        <header className="studio-toolbar">
          <div className="toolbar-brand"><button className="icon-button" onClick={onBack} aria-label="Back to sessions">←</button>
            <div><span className="eyebrow">BETWEENER STUDIO</span><strong>{snapshot.session.title}</strong></div></div>
          <div className="toolbar-status"><span className="status-dot healthy" />
            <span>{friendlyReason(snapshot.session.status)}</span><span className="divider" />
            <span>Controller: <strong>{controllerLabel}</strong></span>
            {lease.renewing ? <small>renewing</small> : null}</div>
          <div className="toolbar-actions">
            {snapshot.access.canControl && snapshot.session.status !== 'live' && snapshot.session.ownershipType === 'human'
              ? <button className="button button-secondary" disabled={busy !== null}
                onClick={() => void startLive()}>Start Live</button> : null}
            {snapshot.access.canControl && !lease.ownsControl
              ? <button className="button button-primary" disabled={busy !== null}
                onClick={() => void takeControl()}>Take Control</button> : null}
            {lease.ownsControl ? <button className="button button-secondary" disabled={busy !== null}
              onClick={() => void resumeOdo()}>Resume Odo</button> : null}
            {snapshot.access.canControl && snapshot.session.status === 'live' && snapshot.session.ownershipType === 'human'
              ? <button className="button button-danger" disabled={busy !== null}
                onClick={() => void endLive()}>End Live</button> : null}
          </div>
        </header>

        {(loadError || commandError) ? <div className="workspace-alert" role="alert">
          {loadError || commandError}<button onClick={() => { setCommandError(null); void refresh(); }}>Refresh</button>
        </div> : null}
        {stalePreview ? <div className="workspace-alert warning" role="status">
          Program changed after this Preview was prepared.
          <button onClick={() => setPreview(previewFromProgram(snapshot.program))}>Sync Preview</button>
        </div> : null}

        <div className="studio-grid">
          <aside className="left-rail stack-md">
            <section className="panel">
              <div className="section-heading"><div><span className="eyebrow">SOURCES</span><h2>Media desk</h2></div>
                <span className="status-pill">{snapshot.sources.filter((source) => source.readiness === 'live').length} live</span></div>
              <StudioMediaControls snapshot={snapshot} controllerInstanceId={controllerInstanceId}
                onChanged={() => void refresh()} />
              <StudioDjSource snapshot={snapshot} controllerInstanceId={controllerInstanceId}
                onChanged={() => void refresh()} />
              <div className="source-list">
                {snapshot.sources.map((source) => <div className="source-row" key={source.id}>
                  <span className={`status-dot ${source.health}`} /><div><strong>{source.key}</strong>
                    <small>{friendlyReason(source.type)} · {source.readiness}</small></div>
                </div>)}
              </div>
            </section>
          </aside>

          <section className="production-desk stack-md">
            <div className="monitor-grid">
              <section className="monitor-card preview-monitor"><div className="monitor-header">
                <div><span className="eyebrow">PREVIEW</span><strong>Local to this tab</strong></div>
                <span className={`status-pill ${preview.dirty ? 'changed' : ''}`}>{preview.dirty ? 'Changed' : 'Synced'}</span>
              </div><ProgramRenderer state={preview} sources={snapshot.sources} label="Studio Preview" /></section>
              <section className="monitor-card program-monitor"><div className="monitor-header">
                <div><span className="eyebrow">PROGRAM</span><strong>Audience output</strong></div>
                <span className="status-pill live-badge">LIVE · v{snapshot.program.programVersion}</span>
              </div><ProgramRenderer state={snapshot.program} sources={snapshot.sources} label="Audience Program" /></section>
            </div>
            <div className="take-bar">
              <div><strong>Preview → Program</strong><small>Preview never changes the audience until TAKE or CUT.</small></div>
              <div className="button-row"><button className="button button-secondary"
                disabled={!lease.ownsControl || busy !== null || stalePreview}
                onClick={() => void takeProgram(true)}>CUT</button>
                <button className="button take-button"
                  disabled={!lease.ownsControl || busy !== null || !preview.dirty || stalePreview}
                  onClick={() => void takeProgram(false)}>TAKE</button></div>
            </div>
            <section className="panel"><div className="section-heading"><div><span className="eyebrow">SCENE LIBRARY</span>
              <h2>Shape the programme</h2></div><span className="muted compact">Ctrl+Enter TAKE · Ctrl+Shift+Enter CUT</span></div>
              <SceneLibrary preview={preview} sources={snapshot.sources}
                onScene={(scene: ProgramScene) => {
                  setPreview({ ...preview, scene,
                    sourceAssignments: assignmentsForScene(scene, snapshot.sources, preview.sourceAssignments),
                    dirty: true });
                }}
                onAssignment={(slot: ProgramSourceSlot, key: string | null) => mutatePreview({ type: 'assign_source', slot, sourceKey: key })}
                onCanvas={(canvas: ProgramTargetCanvas) => mutatePreview({ type: 'set_canvas', canvas })}
                onTransition={(transition: ProgramTransition) => mutatePreview({ type: 'set_transition', transition })} />
            </section>
          </section>

          <aside className="right-rail"><OperationalPanels snapshot={snapshot}
            ownsControl={lease.ownsControl} onChanged={() => void refresh()} /></aside>
        </div>
      </main>
    </StudioMediaProvider>
  );
}
