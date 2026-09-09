import type { OdoCopilotProviderDraft, OdoCopilotTask } from './provider.ts';

const UNSAFE_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /wss?:\/\//i,
  /\b(?:execute|invoke|call)\s+(?:sql|rpc|function)\b/i,
  /\brpc_[a-z0-9_]+\b/i,
  /\b(?:password|access[_ -]?token|service[_ -]?role|api[_ -]?key)\b/i,
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

export type OdoCopilotGateResult =
  | { accepted: true; reasonCode: 'content_safe' | 'content_not_present' }
  | { accepted: false; reasonCode: 'content_gate_rejected' | 'invalid_signal_reference' };

const generatedText = (draft: OdoCopilotProviderDraft): string => [
  draft.context,
  draft.question,
  draft.copy,
].filter((value): value is string => typeof value === 'string').join('\n');

export class ServerOdoCopilotContentGate {
  async inspect(options: {
    task: OdoCopilotTask;
    draft: OdoCopilotProviderDraft;
    allowedSignalCodes: readonly string[];
  }): Promise<OdoCopilotGateResult> {
    const allowed = new Set(options.allowedSignalCodes);
    if (options.draft.signalCodesUsed.some((code) => !allowed.has(code))) {
      return { accepted: false, reasonCode: 'invalid_signal_reference' };
    }
    const content = generatedText(options.draft);
    if (!content) return { accepted: true, reasonCode: 'content_not_present' };
    if (new TextEncoder().encode(content).byteLength > 2_048
      || UNSAFE_PATTERNS.some((pattern) => pattern.test(content))) {
      return { accepted: false, reasonCode: 'content_gate_rejected' };
    }
    return { accepted: true, reasonCode: 'content_safe' };
  }
}
