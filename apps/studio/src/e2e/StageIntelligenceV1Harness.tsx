import {
  stageIntelligenceV1,
  type ProgramSource,
  type ProgramSourceType,
  type StageIntelligenceInputV1,
} from '@betweener/live-program-domain';

import { StageIntelligenceRecommendations } from '../program/StageIntelligenceRecommendations.tsx';

type Scenario = 'host-1' | 'host-2' | 'host-5' | 'screen' | 'pair' | 'pool' | 'pulse' | 'quiet';

const source = (type: ProgramSourceType, index = 0): ProgramSource => ({
  id: `${type}-${index}`,
  key: `source.${type}.${index}`,
  type,
  role: 'visual',
  ownerUserId: ['host_camera', 'participant_camera'].includes(type) ? `owner-${index}` : null,
  providerUserId: ['host_camera', 'participant_camera'].includes(type) ? `provider-${index}` : null,
  hasVideo: true,
  hasAudio: false,
  readiness: 'live',
  health: 'healthy',
  muted: false,
  failureReasonCode: null,
  generation: 1,
  version: 1,
  lastSeenAt: new Date(0).toISOString(),
});

const people = (occupancy: number) => [source('host_camera'), ...Array.from({
  length: Math.max(0, occupancy - 1),
}, (_, index) => source('participant_camera', index + 1))];

const scenarioInput = (scenario: Scenario): StageIntelligenceInputV1 => {
  const occupancy = scenario === 'host-1' || ['pool', 'pulse'].includes(scenario) ? 1
    : scenario === 'host-2' || scenario === 'pair' ? 2
      : scenario === 'host-5' ? 6 : scenario === 'quiet' ? 0 : 3;
  const extra: ProgramSource[] = [source('branded_visual')];
  if (scenario === 'screen') extra.push(source('screen_share'));
  if (scenario === 'pair') extra.push(source('active_pair'));
  if (scenario === 'pool') extra.push(source('quick_connect_pool'));
  if (scenario === 'pulse') extra.push(source('audience_pulse'));
  if (scenario === 'quiet') extra.push(source('odo_stage'));
  return {
    programScene: 'branded_intermission',
    programIntent: 'safe_intermission',
    programAssignments: { odo: 'source.branded_visual.0' },
    previewScene: 'branded_intermission',
    previewIntent: 'safe_intermission',
    canvas: 'landscape_16_9',
    occupancy,
    programmeRoles: {
      host: 'primary_host', guest_1: 'guest', guest_2: 'guest', guest_3: 'guest',
      guest_4: 'guest', guest_5: 'guest',
    },
    sources: [...people(occupancy), ...extra],
    activePair: { active: scenario === 'pair' },
    quickConnect: { state: scenario === 'pool' ? 'open' : 'closed', poolCount: scenario === 'pool' ? 4 : 0 },
    audiencePulse: { lifecycle: scenario === 'pulse' ? 'active' : 'unavailable' },
    capacity: occupancy > 4 ? 6 : 4,
    largePanelEnabled: occupancy > 4,
    sustainedSpeaker: null,
    lowLiquidity: scenario === 'quiet',
    safetyMode: 'normal',
    manualLocks: { currentScene: false },
    sceneDwellMs: 60_000,
    recentSceneHistory: [],
  };
};

const supportedScenario = (value: string | null): Scenario => {
  const scenarios: readonly Scenario[] = [
    'host-1', 'host-2', 'host-5', 'screen', 'pair', 'pool', 'pulse', 'quiet',
  ];
  return scenarios.includes(value as Scenario) ? value as Scenario : 'host-1';
};

export function StageIntelligenceV1Harness() {
  const scenario = supportedScenario(new URL(window.location.href).searchParams.get('scenario'));
  const result = stageIntelligenceV1(scenarioInput(scenario));
  return <main className="m2-review-book stage-intelligence-review" data-testid="stage-intelligence-review">
    <header className="m2-review-header">
      <div><span>BETWEENER STUDIO · INTERNAL</span><h1>Stage Intelligence V1</h1></div>
      <strong>{scenario.replaceAll('-', ' ')}</strong>
    </header>
    <StageIntelligenceRecommendations result={result} onPreview={() => undefined} />
  </main>;
}
