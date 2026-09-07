import {
  DeterministicOdoContentGate,
  actionHasGeneratedContent,
  replaceUnsafeOdoContent,
  type OdoAction,
  type OdoContentGate,
  type OdoContentGateResult,
} from '../../../../features/live/odo/domain/index.ts';

export type SemanticOdoContentInspector = (content: string) => Promise<{
  decision: 'ALLOW' | 'BLOCK' | 'REVIEW';
  reasonCode: string;
}>;

export class ServerOdoContentGate implements OdoContentGate {
  private readonly deterministic = new DeterministicOdoContentGate();
  private readonly semanticInspector?: SemanticOdoContentInspector;

  constructor(semanticInspector?: SemanticOdoContentInspector) {
    this.semanticInspector = semanticInspector;
  }

  async inspect(action: OdoAction): Promise<OdoContentGateResult> {
    const deterministic = await this.deterministic.inspect(action);
    if (!deterministic.accepted) {
      return {
        accepted: true,
        reasonCode: 'content_replaced',
        replacementAction: replaceUnsafeOdoContent(action),
      };
    }
    if (!actionHasGeneratedContent(action) || !this.semanticInspector) {
      return deterministic;
    }

    // Deliberately one pass: a rejection goes to deterministic fallback, never another LLM call.
    const semantic = await this.semanticInspector(JSON.stringify(action.payload));
    return semantic.decision === 'ALLOW'
      ? { accepted: true, reasonCode: 'content_safe' }
      : {
        accepted: true,
        reasonCode: 'content_replaced',
        replacementAction: replaceUnsafeOdoContent(action),
      };
  }
}
