import {
  parseProgramSources,
  parseProgramState,
  type ProgramSource,
  type ProgramState,
} from '@betweener/live-program-domain';

export type CompositorSnapshot = {
  available: true;
  reasonCode: string;
  serverNow: string;
  session: {
    id: string;
    title: string;
    status: 'backstage' | 'live' | 'ending';
    version: number;
  };
  provider: { callType: string; callId: string; userId: string };
  program: ProgramState;
  sources: ProgramSource[];
  outputs: {
    hls: boolean;
    recording: boolean;
    captions: boolean;
    translationLanguages: string[];
  };
};

export type CompositorBootstrap = {
  schemaVersion: 1;
  apiKey: string;
  callToken: string;
  expiresAt: string;
  call: { type: string; id: string; cid: string };
  user: { id: string; name: string };
  snapshot: CompositorSnapshot;
};

const object = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

export const parseCompositorSnapshot = (value: unknown): CompositorSnapshot => {
  const candidate = object(value);
  const session = object(candidate?.session);
  const provider = object(candidate?.provider);
  const outputs = object(candidate?.outputs);
  const program = parseProgramState(candidate?.program);
  const sources = parseProgramSources(candidate?.sources);
  if (candidate?.available !== true || typeof candidate.serverNow !== 'string'
    || typeof session?.id !== 'string' || typeof session.title !== 'string'
    || !['backstage', 'live', 'ending'].includes(String(session.status))
    || typeof provider?.callType !== 'string' || typeof provider.callId !== 'string'
    || !String(provider.userId ?? '').startsWith('studio-program-')
    || !program || program.sessionId !== session.id || !sources
    || typeof outputs?.hls !== 'boolean' || typeof outputs.recording !== 'boolean'
    || typeof outputs.captions !== 'boolean' || !Array.isArray(outputs.translationLanguages)
    || !outputs.translationLanguages.every((language) => typeof language === 'string')) {
    throw new Error('broadcast_compositor_snapshot_invalid');
  }
  return { ...candidate, program, sources } as unknown as CompositorSnapshot;
};

export const parseCompositorBootstrap = (value: unknown): CompositorBootstrap => {
  const candidate = object(value);
  const call = object(candidate?.call);
  const user = object(candidate?.user);
  if (candidate?.schemaVersion !== 1 || typeof candidate.apiKey !== 'string'
    || typeof candidate.callToken !== 'string' || typeof candidate.expiresAt !== 'string'
    || typeof call?.type !== 'string' || typeof call.id !== 'string'
    || typeof user?.id !== 'string' || typeof user.name !== 'string') {
    throw new Error('broadcast_compositor_bootstrap_invalid');
  }
  return ({
    ...candidate,
    snapshot: parseCompositorSnapshot(candidate.snapshot),
  } as unknown as CompositorBootstrap);
};
