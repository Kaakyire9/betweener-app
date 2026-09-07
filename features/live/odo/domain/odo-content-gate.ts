import type { OdoAction, OdoActionType } from './odo-contracts.ts';

export const ODO_CONTENT_ACTION_TYPES = [
  'SESSION_WELCOME',
  'SHOW_CONVERSATION_SPARK',
  'SHOW_INTERMISSION',
  'SESSION_CLOSING',
] as const satisfies readonly OdoActionType[];

export type OdoContentGateResult =
  | {
    accepted: true;
    reasonCode: 'content_safe' | 'content_not_present' | 'content_replaced';
    replacementAction?: OdoAction;
  }
  | { accepted: false; reasonCode: string; replacementAction?: OdoAction };

export interface OdoContentGate {
  inspect(action: OdoAction): Promise<OdoContentGateResult>;
}

export const actionHasGeneratedContent = (action: OdoAction): boolean =>
  ODO_CONTENT_ACTION_TYPES.includes(action.type as (typeof ODO_CONTENT_ACTION_TYPES)[number]);

export const replaceUnsafeOdoContent = (action: OdoAction): OdoAction => {
  switch (action.type) {
    case 'SESSION_WELCOME':
      return {
        ...action,
        payload: { copy: 'Welcome. We are glad you are here.', locale: 'en' },
      } as OdoAction;
    case 'SHOW_CONVERSATION_SPARK':
      return {
        ...action,
        payload: {
          roundId: action.payload.roundId,
          context: 'A shared conversation',
          question: 'What brought you joy this week?',
          locale: 'en',
        },
      } as OdoAction;
    case 'SHOW_INTERMISSION':
      return {
        ...action,
        payload: {
          durationSeconds: action.payload.durationSeconds,
          copy: 'We will continue shortly.',
          locale: 'en',
        },
      } as OdoAction;
    case 'SESSION_CLOSING':
      return {
        ...action,
        payload: { copy: 'Thank you for spending this time together.', locale: 'en' },
      } as OdoAction;
    default:
      return action;
  }
};

const UNSAFE_CONTENT_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /\b(?:execute|invoke|call)\s+(?:sql|rpc|function)\b/i,
  /\b(?:password|access[_ -]?token|service[_ -]?role)\b/i,
  /<script\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+?\d[\d\s().-]{7,}\d)/,
  /\b(?:sex|sexual|nudes?|hook\s*up|bedroom)\b/i,
  /\b(?:idiot|stupid|ugly|pathetic|loser|humiliat(?:e|ing)|embarrass(?:ed|ing)?)\b/i,
  /\b(?:most popular|least popular|rank(?:ed|ing)?|score their|rate their|most attractive|least attractive)\b/i,
  /\b(?:perfect match|meant for each other|definitely compatible|guaranteed chemistry)\b/i,
  /\b(?:they (?:love|want|desire|reject|are attracted to) you|secretly attracted|one-sided interest)\b/i,
  /\b(?:must be|obviously|clearly)\s+(?:gay|straight|bisexual|depressed|autistic|religious|pregnant)\b/i,
];

export class DeterministicOdoContentGate implements OdoContentGate {
  async inspect(action: OdoAction): Promise<OdoContentGateResult> {
    if (!actionHasGeneratedContent(action)) {
      return { accepted: true, reasonCode: 'content_not_present' };
    }

    const serialized = JSON.stringify(action.payload);
    const unsafe = serialized.length > 2_048
      || UNSAFE_CONTENT_PATTERNS.some((pattern) => pattern.test(serialized));

    return unsafe
      ? { accepted: false, reasonCode: 'content_gate_rejected' }
      : { accepted: true, reasonCode: 'content_safe' };
  }
}
