import {
  EDITORIAL_PEOPLE_LAYOUT_BOOK_V2,
  EDITORIAL_SCREEN_LAYOUT_STRATEGIES_V2,
  type EditorialPeopleCanvasV2,
  type EditorialPeopleLayoutStrategyV2,
  type EditorialScreenLayoutStrategyV2,
  type ProgramSource,
  type ProgramSourceAssignments,
} from '@betweener/live-program-domain';
import {
  ParticipantView,
  useCallStateHooks,
} from '@stream-io/video-react-sdk';
import { useMemo, useState } from 'react';

import { useOptionalStudioMedia } from '../media/studio-media-context.tsx';
import {
  M2_PREVIEW_MEDIA_STATES,
  M2_EDITORIAL_MOMENT_STRATEGIES,
  M2PreviewModelError,
  buildM2PeoplePreviewModel,
  buildM2MomentPreviewModel,
  buildM2ScreenPreviewModel,
  type M2PreviewMediaState,
  type M2EditorialMomentStrategy,
  type M2PreviewModel,
  type M2PreviewSource,
  type M2PreviewSourceMode,
} from './adaptive-stage-m2-preview-model.ts';

type PreviewFamily = 'people' | 'screen' | 'moments';

const titleCase = (value: string) => value.replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const occupancyFor = (strategy: EditorialPeopleLayoutStrategyV2) =>
  EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.find((entry) => entry.strategy === strategy)?.occupancy ?? 1;

export type AdaptiveStageM2ReviewState = {
  family: PreviewFamily;
  setFamily: (family: PreviewFamily) => void;
  strategy: EditorialPeopleLayoutStrategyV2;
  setStrategy: (strategy: EditorialPeopleLayoutStrategyV2) => void;
  screenStrategy: EditorialScreenLayoutStrategyV2;
  setScreenStrategy: (strategy: EditorialScreenLayoutStrategyV2) => void;
  momentStrategy: M2EditorialMomentStrategy;
  setMomentStrategy: (strategy: M2EditorialMomentStrategy) => void;
  canvas: EditorialPeopleCanvasV2;
  setCanvas: (canvas: EditorialPeopleCanvasV2) => void;
  mode: M2PreviewSourceMode;
  setMode: (mode: M2PreviewSourceMode) => void;
  mediaState: M2PreviewMediaState;
  setMediaState: (state: M2PreviewMediaState) => void;
  showSafeAreas: boolean;
  setShowSafeAreas: (show: boolean) => void;
  model: M2PreviewModel | null;
  error: string | null;
};

export const useAdaptiveStageM2Review = (
  sources: readonly ProgramSource[],
  assignments: ProgramSourceAssignments,
): AdaptiveStageM2ReviewState => {
  const [family, setFamily] = useState<PreviewFamily>('people');
  const [strategy, setStrategy] = useState<EditorialPeopleLayoutStrategyV2>('host_hero_plus_2');
  const [screenStrategy, setScreenStrategy] = useState<EditorialScreenLayoutStrategyV2>('screen_plus_host');
  const [momentStrategy, setMomentStrategy] = useState<M2EditorialMomentStrategy>('host_plus_pool');
  const [canvas, setCanvas] = useState<EditorialPeopleCanvasV2>('portrait_9_16');
  const [mode, setMode] = useState<M2PreviewSourceMode>('fixture');
  const [mediaState, setMediaState] = useState<M2PreviewMediaState>('ready');
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const resolution = useMemo(() => {
    try {
      const model = family === 'screen'
        ? buildM2ScreenPreviewModel({ strategy: screenStrategy, canvas, peopleCount: 4 })
        : family === 'moments'
          ? buildM2MomentPreviewModel({ strategy: momentStrategy, canvas })
          : buildM2PeoplePreviewModel({
          strategy,
          canvas,
          mode,
          mediaState,
          assignments,
          sources,
        });
      return { model, error: null };
    } catch (failure) {
      const message = failure instanceof M2PreviewModelError
        ? `${failure.code}${failure.detail ? ` · ${failure.detail}` : ''}`
        : failure instanceof Error ? failure.message : 'UNKNOWN_PREVIEW_ERROR';
      return { model: null, error: message };
    }
  }, [assignments, canvas, family, mediaState, mode, momentStrategy, screenStrategy, sources, strategy]);

  return {
    family, setFamily, strategy, setStrategy, screenStrategy, setScreenStrategy,
    momentStrategy, setMomentStrategy,
    canvas, setCanvas, mode, setMode, mediaState, setMediaState,
    showSafeAreas, setShowSafeAreas, ...resolution,
  };
};

function RealParticipant({ source }: { source: M2PreviewSource }) {
  const { useParticipants } = useCallStateHooks();
  const participant = useParticipants()
    .find((candidate) => candidate.userId === source.providerUserId);
  if (!participant) return null;
  return <ParticipantView participant={participant} trackType="videoTrack"
    ParticipantViewUI={null} muteAudio />;
}

function ScreenFixture() {
  return <div className="m2-screen-fixture" aria-label="Controlled presentation fixture">
    <div className="m2-screen-chrome"><i /><i /><i /><span>BETWEENER · LIVE BRIEFING</span></div>
    <div className="m2-screen-body"><div><span className="eyebrow">CONNECTION DESIGN</span>
      <strong>Make every voice feel present.</strong><p>Adaptive composition protects faces, context and the story.</p></div>
      <div className="m2-screen-chart"><i /><i /><i /><i /></div></div>
  </div>;
}

function EditorialMomentFixture({ source }: { source: M2PreviewSource }) {
  if (source.role === 'odo') return <div className="m2-moment-fixture moment-odo">
    <span className="m2-odo-mark">O</span><strong>{source.displayName}</strong><small>Editorial guide · never a human tile</small>
  </div>;
  if (source.role === 'music') return <div className="m2-moment-fixture moment-music">
    <div className="m2-waveform">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
    <strong>{source.displayName}</strong><small>Programme atmosphere</small>
  </div>;
  if (source.role === 'pulse') return <div className="m2-moment-fixture moment-pulse">
    <div className="m2-pulse-reactions"><i>♥</i><i>✦</i><i>●</i></div>
    <strong>Audience Pulse</strong><small>Aggregate programme signal · no comments</small>
  </div>;
  if (source.role === 'pair') return <div className="m2-moment-fixture moment-pair">
    <div className="m2-pair-portraits"><i>A</i><i>K</i></div><strong>Active Pair</strong><small>Two admitted people · one editorial source</small>
  </div>;
  return <div className="m2-moment-fixture moment-pool">
    <div className="m2-pool-dots">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
    <strong>{source.displayName}</strong><small>Private identities remain concealed</small>
  </div>;
}

function PreviewTile({ source, index }: { source: M2PreviewSource | undefined; index: number }) {
  const binding = useOptionalStudioMedia()?.binding ?? null;
  const showRealTrack = Boolean(binding && source && !source.fixture
    && source.providerUserId && source.mediaState === 'ready');
  if (source?.role === 'screen') return <ScreenFixture />;
  if (source && ['odo', 'music', 'pulse', 'pair', 'pool'].includes(source.role)) {
    return <EditorialMomentFixture source={source} />;
  }
  const state = source?.mediaState ?? 'reconnecting';
  const initials = source?.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2) ?? '?';
  return <div className={`m2-person-tile tone-${index % 6} state-${state}`}>
    {showRealTrack && source ? <RealParticipant source={source} /> : null}
    {!showRealTrack || state !== 'ready' ? <div className="m2-person-art" aria-hidden="true">
      <span className="m2-avatar">{initials}</span><i className="m2-ambient-ring" />
    </div> : null}
    <div className="m2-tile-label"><span><strong>{source?.displayName ?? 'Source unavailable'}</strong>
      <small>{source ? titleCase(source.role) : 'Missing source'}</small></span>
      {source?.muted ? <b aria-label="Muted">MUTED</b> : null}</div>
    {state !== 'ready' ? <div className="m2-media-state">
      {state === 'camera_off' ? 'Camera off' : state === 'reconnecting' ? 'Reconnecting…' : 'Connection degraded'}
    </div> : null}
  </div>;
}

export function AdaptiveStageM2PreviewCanvas({
  review,
  compact = false,
}: {
  review: Pick<AdaptiveStageM2ReviewState, 'model' | 'error' | 'showSafeAreas'>;
  compact?: boolean;
}) {
  if (review.error || !review.model) return <div className="m2-preview-error" role="alert">
    <span className="eyebrow">PREVIEW ERROR</span><strong>{review.error ?? 'Layout unavailable'}</strong>
    <small>No fallback strategy or source was substituted.</small>
  </div>;
  const model = review.model;
  return <div className={`m2-program-canvas canvas-${model.canvas} ${compact ? 'is-compact' : ''}`}
    data-strategy={model.strategy} data-canvas={model.canvas}>
    <div className="m2-stage-atmosphere" aria-hidden="true" />
    {model.regions.map((region, index) => <div className={`m2-program-region treatment-${region.treatment}`}
      key={`${region.slot}:${index}`} style={{
        left: `${region.x * 100}%`, top: `${region.y * 100}%`,
        width: `${region.width * 100}%`, height: `${region.height * 100}%`,
        zIndex: region.zIndex,
      }}>
      <PreviewTile source={model.sourcesBySlot[region.slot]} index={index} />
    </div>)}
    <div className="m2-preview-watermark">PREVIEW · M2 INTERNAL</div>
    {model.fixture ? <div className="m2-fixture-badge">CONTROLLED FIXTURES</div> : null}
    {model.largePanelPreview ? <div className="m2-large-panel-badge">LARGE PANEL · PREVIEW</div> : null}
    {review.showSafeAreas ? <><div className="m2-content-safe" /><div className="m2-caption-safe" /></> : null}
  </div>;
}

export function AdaptiveStageM2PreviewControls({ review }: { review: AdaptiveStageM2ReviewState }) {
  const entriesByOccupancy = [1, 2, 3, 4, 5, 6].map((occupancy) => ({
    occupancy,
    entries: EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.filter((entry) => entry.occupancy === occupancy),
  }));
  return <div className="m2-review-controls stack-md" data-testid="m2-preview-controls">
    <div className="m2-preview-toolbar">
      <div className="segmented-control" aria-label="Preview family">
        <button className={review.family === 'people' ? 'selected' : ''}
          onClick={() => review.setFamily('people')}>People</button>
        <button className={review.family === 'screen' ? 'selected' : ''}
          onClick={() => review.setFamily('screen')}>Screen share</button>
        <button className={review.family === 'moments' ? 'selected' : ''}
          onClick={() => review.setFamily('moments')}>Editorial moments</button>
      </div>
      <div className="segmented-control" aria-label="Preview canvas">
        <button className={review.canvas === 'portrait_9_16' ? 'selected' : ''}
          onClick={() => review.setCanvas('portrait_9_16')}>Portrait 9:16</button>
        <button className={review.canvas === 'landscape_16_9' ? 'selected' : ''}
          onClick={() => review.setCanvas('landscape_16_9')}>Landscape 16:9</button>
        <button disabled title="Square is not authored in the M2 layout book">Square 1:1</button>
      </div>
    </div>
    {review.family === 'people' ? <>
      <div className="m2-preview-toolbar">
        <label className="field-label">Source mode<select value={review.mode}
          onChange={(event) => review.setMode(event.target.value as M2PreviewSourceMode)}>
          <option value="fixture">Controlled fixtures</option><option value="authoritative">Authoritative Live sources</option>
        </select></label>
        <label className="field-label">Primary source state<select value={review.mediaState}
          disabled={review.mode === 'authoritative'}
          onChange={(event) => review.setMediaState(event.target.value as M2PreviewMediaState)}>
          {M2_PREVIEW_MEDIA_STATES.map((state) => <option value={state} key={state}>{titleCase(state)}</option>)}
        </select></label>
        <label className="check-row"><input type="checkbox" checked={review.showSafeAreas}
          onChange={(event) => review.setShowSafeAreas(event.target.checked)} />Safe-area diagnostics</label>
      </div>
      <div className="m2-strategy-browser">
        {entriesByOccupancy.map(({ occupancy, entries }) => <section key={occupancy}>
          <header><strong>{occupancy} {occupancy === 1 ? 'person' : 'people'}</strong><span>{entries.length}</span></header>
          <div>{entries.map((entry) => <button key={entry.strategy}
            className={review.strategy === entry.strategy ? 'selected' : ''}
            onClick={() => review.setStrategy(entry.strategy)}>
            <i className={`m2-mini-layout family-${entry.geometryFamily}`} />
            <span><strong>{titleCase(entry.strategy)}</strong><small>{titleCase(entry.primaryRole)} · {titleCase(entry.geometryFamily)}</small></span>
          </button>)}</div>
        </section>)}
      </div>
    </> : review.family === 'screen' ? <div className="m2-screen-browser">
      {EDITORIAL_SCREEN_LAYOUT_STRATEGIES_V2.map((strategy) => <button key={strategy}
        className={review.screenStrategy === strategy ? 'selected' : ''}
        onClick={() => review.setScreenStrategy(strategy)}>
        <strong>{titleCase(strategy)}</strong><small>Content-first · contain</small>
      </button>)}
      <p className="notice-copy">Fixture contains readable text, shapes and presentation structure. Screen content uses contain-fit with an ambient matte.</p>
    </div> : <div className="m2-screen-browser">
      {M2_EDITORIAL_MOMENT_STRATEGIES.map((strategy) => <button key={strategy}
        className={review.momentStrategy === strategy ? 'selected' : ''}
        onClick={() => review.setMomentStrategy(strategy)}>
        <strong>{titleCase(strategy)}</strong><small>Visual preview only · no choreography</small>
      </button>)}
      <p className="notice-copy">Odo remains a graphical editorial layer. Quick Connect previews do not expose private pool identities or start choreography.</p>
    </div>}
  </div>;
}

export function AdaptiveStageM2ReviewBook({
  canvas,
  review = 'people',
}: {
  canvas: EditorialPeopleCanvasV2;
  review?: 'people' | 'screen' | 'moments' | 'states';
}) {
  const models = review === 'people'
    ? EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.map((entry) => buildM2PeoplePreviewModel({
      strategy: entry.strategy, canvas, mode: 'fixture',
    }))
    : review === 'screen'
      ? EDITORIAL_SCREEN_LAYOUT_STRATEGIES_V2.map((strategy) => buildM2ScreenPreviewModel({
        strategy, canvas, peopleCount: strategy.includes('panel') || strategy === 'screen_discussion' ? 6 : undefined,
      }))
      : review === 'moments'
        ? M2_EDITORIAL_MOMENT_STRATEGIES.map((strategy) => buildM2MomentPreviewModel({ strategy, canvas }))
      : M2_PREVIEW_MEDIA_STATES.map((mediaState) => buildM2PeoplePreviewModel({
        strategy: 'host_hero_plus_2', canvas, mode: 'fixture', mediaState,
      }));
  return <main className="m2-review-book" data-testid="m2-review-book">
    <header><span className="eyebrow">BETWEENER · INTERNAL DESIGN REVIEW</span>
      <h1>Adaptive Stage Engine 2.0</h1><p>{titleCase(review)} · {titleCase(canvas)}</p></header>
    <div className={`m2-review-grid review-${review}`}>
      {models.map((model) => <article key={`${model.strategy}:${model.kind}:${model.sourcesBySlot.host?.mediaState ?? ''}`}>
        <div><strong>{titleCase(model.strategy)}</strong><span>{model.occupancy} {model.occupancy === 1 ? 'person' : 'people'}</span></div>
        <AdaptiveStageM2PreviewCanvas review={{ model, error: null, showSafeAreas: false }} compact />
      </article>)}
    </div>
  </main>;
}

export const describeM2Strategy = (strategy: EditorialPeopleLayoutStrategyV2) => ({
  occupancy: occupancyFor(strategy),
  label: titleCase(strategy),
});
