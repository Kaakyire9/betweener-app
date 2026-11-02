import {
  resolveScreenPresentationPolicyV1,
  type ProgramTargetCanvas,
  type ScreenContentMode,
  type ScreenFitMode,
} from '@betweener/live-program-domain';

type FixtureKind = 'document' | 'presentation' | 'media' | 'subtitle' | 'edge_text';

const canvasLabel: Record<ProgramTargetCanvas, string> = {
  portrait_9_16: 'Portrait 9:16',
  landscape_16_9: 'Landscape 16:9',
  square_1_1: 'Square 1:1',
};

const contentModeForFixture = (fixture: FixtureKind): ScreenContentMode => (
  fixture === 'document' || fixture === 'edge_text' ? 'document'
    : fixture === 'presentation' ? 'presentation' : 'media'
);

function Fixture({ kind, fit }: { kind: FixtureKind; fit: 'contain' | 'cover' }) {
  return <svg className="fit-lab-fixture" viewBox="0 0 1600 900"
    preserveAspectRatio={`xMidYMid ${fit === 'cover' ? 'slice' : 'meet'}`}
    role="img" aria-label={`${kind.replaceAll('_', ' ')} fixture`}>
    <rect width="1600" height="900" fill={kind === 'media' || kind === 'subtitle' ? '#171828' : '#f4f0e8'} />
    {kind === 'document' ? <>
      <rect x="180" y="70" width="1240" height="760" rx="18" fill="#fff" />
      <text x="250" y="170" fontSize="70" fontWeight="700" fill="#102c29">Quarterly editorial brief</text>
      {[0, 1, 2, 3, 4, 5].map((line) => <rect key={line} x="250" y={235 + line * 72}
        width={line === 5 ? 720 : 1080} height="18" rx="9" fill="#6d7d79" />)}
      <rect x="250" y="700" width="450" height="70" rx="14" fill="#0e8e84" />
    </> : kind === 'presentation' ? <>
      <rect x="95" y="80" width="1410" height="740" rx="30" fill="#0b312d" />
      <text x="180" y="250" fontSize="54" letterSpacing="8" fill="#67ded2">BETWEENER LIVE</text>
      <text x="180" y="400" fontSize="104" fontWeight="700" fill="#fff8ef">Ideas deserve room.</text>
      <circle cx="1240" cy="500" r="190" fill="#45c9bb" opacity=".34" />
    </> : kind === 'edge_text' ? <>
      <rect x="0" y="0" width="1600" height="900" fill="#f8f5ef" />
      <text x="18" y="75" fontSize="52" fontWeight="700" fill="#162b28">LEFT EDGE MUST REMAIN</text>
      <text x="1582" y="840" textAnchor="end" fontSize="52" fontWeight="700" fill="#162b28">RIGHT EDGE MUST REMAIN</text>
      <path d="M35 130 H1565 V770 H35 Z" fill="none" stroke="#12a99c" strokeWidth="18" />
    </> : <>
      <defs><linearGradient id={`media-${kind}`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#1f665d" /><stop offset="1" stopColor="#683b72" />
      </linearGradient></defs>
      <rect width="1600" height="900" fill={`url(#media-${kind})`} />
      <circle cx="800" cy="410" r="235" fill="#f4b95f" opacity=".88" />
      <path d="M0 690 Q390 520 800 700 T1600 650 V900 H0 Z" fill="#071815" opacity=".78" />
      {kind === 'subtitle' ? <text x="800" y="842" textAnchor="middle" fontSize="56"
        fontWeight="700" fill="white" stroke="#000" strokeWidth="8" paintOrder="stroke">
        The full thought belongs on screen.
      </text> : <text x="90" y="120" fontSize="52" fontWeight="700" fill="white">16:9 MEDIA FIXTURE</text>}
    </>}
  </svg>;
}

export function ScreenFitLabCard({
  canvas,
  mode,
  fixture = 'media',
  scene = 'screen_full',
}: {
  canvas: ProgramTargetCanvas;
  mode: ScreenFitMode;
  fixture?: FixtureKind;
  scene?: 'screen_full' | 'screen_plus_host' | 'screen_plus_panel' | 'screen_discussion';
}) {
  const policy = resolveScreenPresentationPolicyV1({
    screenFitMode: mode,
    contentMode: contentModeForFixture(fixture),
    sourceAspect: 16 / 9,
    targetCanvas: canvas,
  });
  return <article className="fit-lab-card" data-testid={`fit-lab-${canvas}-${mode}-${fixture}-${scene}`}>
    <header><strong>{canvasLabel[canvas]} · {mode.toUpperCase()}</strong>
      <span>{policy.fit} · crop {(policy.requiredCropFraction * 100).toFixed(1)}%</span></header>
    <div className={`fit-lab-stage canvas-${canvas} scene-${scene} matte-${policy.matte}`}>
      <div className="fit-lab-screen"><Fixture kind={fixture} fit={policy.fit} /></div>
      {scene !== 'screen_full' ? <div className="fit-lab-people" aria-label="People support region">
        <i>K</i>{scene !== 'screen_plus_host' ? <><i>D</i><i>A</i></> : null}
      </div> : null}
    </div>
  </article>;
}

export function ScreenPresentationFitLab() {
  const canvases: ProgramTargetCanvas[] = ['portrait_9_16', 'square_1_1', 'landscape_16_9'];
  const modes: ScreenFitMode[] = ['auto', 'fit', 'fill'];
  const fixtures: FixtureKind[] = ['document', 'presentation', 'media', 'subtitle', 'edge_text'];
  return <main className="fit-lab" data-testid="screen-fit-lab">
    <header className="fit-lab-title"><span>BETWEENER · INTERNAL M2 FIT LAB</span>
      <h1>Screen Presentation Fit V1</h1><p>Static fixtures only · no captured pixels</p></header>
    <section><h2>16:9 source across canonical canvases</h2><div className="fit-lab-grid">
      {canvases.flatMap((canvas) => modes.map((mode) => (
        <ScreenFitLabCard key={`${canvas}:${mode}`} canvas={canvas} mode={mode} />
      )))}</div></section>
    <section><h2>Content safety fixtures · FIT</h2><div className="fit-lab-grid">
      {fixtures.map((fixture) => <ScreenFitLabCard key={fixture} canvas="portrait_9_16"
        mode="fit" fixture={fixture} />)}</div></section>
    <section><h2>Scene integration</h2><div className="fit-lab-grid">
      <ScreenFitLabCard canvas="landscape_16_9" mode="fit" scene="screen_plus_host" />
      <ScreenFitLabCard canvas="landscape_16_9" mode="fit" scene="screen_plus_panel" />
      <ScreenFitLabCard canvas="landscape_16_9" mode="fit" scene="screen_discussion" />
    </div></section>
  </main>;
}
