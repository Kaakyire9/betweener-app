import {
  ODO_COPILOT_SCENES,
  type OdoCopilotScene,
} from './odo-copilot-contracts.ts';
import type { LiveDirectorEvent } from '../domain/odo-contracts.ts';

export type OdoCopilotParticipantNotice = {
  body: string;
  key: string;
  title: string;
};

const readBoundedCopy = (value: unknown, maximumLength = 280): string | null => {
  if (typeof value !== 'string') return null;
  const copy = value.trim();
  if (copy.length === 0 || copy.length > maximumLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(copy)) {
    return null;
  }
  return copy;
};

const sceneLabels: Readonly<Record<string, string>> = {
  host_focus: 'Host focus',
  host_plus_pool: 'Host and room',
  pool_focus: 'Room focus',
  pair_forming: 'Pairing moment',
  quick_connect_active: 'Quick Connect',
  audience_pulse: 'Audience Pulse',
  conversation_topic: 'Conversation topic',
  music_intermission_visual_only: 'Intermission',
  odo_stage: 'Odo moment',
  session_closing: 'Closing moment',
};

export const getHostApprovedOdoScene = (
  event: LiveDirectorEvent,
): OdoCopilotScene | null => {
  if (event.eventType !== 'SCENE_CHANGED'
    || !['host', 'odo'].includes(event.source)
    || event.visibility !== 'participant') return null;
  const scene = readBoundedCopy(event.payload.scene, 40);
  return scene && ODO_COPILOT_SCENES.includes(scene as OdoCopilotScene)
    ? scene as OdoCopilotScene
    : null;
};

/** Maps public, policy-approved Odo presentation events into bounded room copy. */
export const getOdoCopilotParticipantNotice = (
  event: LiveDirectorEvent,
): OdoCopilotParticipantNotice | null => {
  if (event.eventType === 'UNKNOWN'
    || !['host', 'odo'].includes(event.source)
    || event.visibility !== 'participant') return null;

  const common = { key: `odo-copilot:${event.eventId}` };
  if (event.eventType === 'PAIR_INTRODUCTION_PUBLISHED') {
    const copy = readBoundedCopy(event.payload.copy);
    return copy ? { ...common, title: 'A new introduction', body: copy } : null;
  }
  if (event.eventType === 'TRANSITION_COPY_PUBLISHED') {
    const copy = readBoundedCopy(event.payload.copy);
    return copy ? { ...common, title: event.source === 'odo' ? 'A note from Odo' : 'A note from your Host', body: copy } : null;
  }
  if (event.eventType === 'SESSION_WELCOME_PUBLISHED') {
    const copy = readBoundedCopy(event.payload.copy);
    return copy ? { ...common, title: 'Welcome to the room', body: copy } : null;
  }
  if (event.eventType === 'SESSION_CLOSING_PUBLISHED') {
    const copy = readBoundedCopy(event.payload.copy);
    return copy ? { ...common, title: 'Before we close', body: copy } : null;
  }
  if (event.eventType === 'SCENE_CHANGED') {
    const scene = getHostApprovedOdoScene(event);
    const label = scene ? sceneLabels[scene] : null;
    return label ? { ...common, title: label, body: event.source === 'odo'
      ? 'Odo has moved the room into a new presentation moment.'
      : 'The Host has moved the room into a new moment.' } : null;
  }
  if (event.eventType === 'SESSION_NARRATION_PUBLISHED') {
    const copy = readBoundedCopy(event.payload.copy);
    return copy ? { ...common, title: 'Odo', body: copy } : null;
  }
  if (event.eventType === 'TIME_CUE_PUBLISHED') {
    const copy = readBoundedCopy(event.payload.copy, 120);
    return copy ? { ...common, title: 'Time cue', body: copy } : null;
  }
  if (event.eventType === 'ODO_INTERMISSION_STARTED') {
    const copy = readBoundedCopy(event.payload.copy, 180);
    return copy ? { ...common, title: 'A short intermission', body: copy } : null;
  }
  if (event.eventType === 'QUICK_CONNECT_POOL_OPENED') {
    return {
      ...common,
      title: 'Quick Connect is open',
      body: 'Odo has opened the pool. Join whenever you feel ready.',
    };
  }
  if (event.eventType === 'QUICK_CONNECT_PAIR_FORMING') {
    return {
      ...common,
      title: 'A connection is forming',
      body: 'Betweener has found an eligible pair and is preparing their private conversation.',
    };
  }
  if (event.eventType === 'QUICK_CONNECT_ROUND_COMPLETED') {
    return {
      ...common,
      title: 'Conversation complete',
      body: 'Eligible members can return to the pool for the next thoughtful connection.',
    };
  }
  if (event.eventType === 'QUICK_CONNECT_LOW_LIQUIDITY') {
    return {
      ...common,
      title: 'Preparing the next connection',
      body: 'Odo is waiting for another eligible pairing. No connection will be forced.',
    };
  }
  if (event.eventType === 'QUICK_CONNECT_DRAINING') {
    return {
      ...common,
      title: 'Quick Connect is wrapping up',
      body: 'Current conversations can finish, and no new pairing cycle will begin.',
    };
  }
  if (event.eventType === 'QUICK_CONNECT_CLOSING') {
    const copy = readBoundedCopy(event.payload.copy, 180);
    return copy ? { ...common, title: 'Quick Connect is closing', body: copy } : null;
  }
  if (event.eventType === 'QUICK_CONNECT_CLOSED') {
    return {
      ...common,
      title: 'Quick Connect is complete',
      body: 'The rotation has closed. The main Live room remains open.',
    };
  }

  // Spark and Audience Pulse already have dedicated live projections and UI.
  return null;
};
