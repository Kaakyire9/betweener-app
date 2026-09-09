import type {
  OdoAIProvider,
  OdoAudiencePulse,
  OdoConversationSpark,
  OdoCopilotProviderDraft,
  OdoCopilotTask,
  OdoProviderRequest,
  OdoProviderResult,
} from './provider.ts';
import type { OdoAction } from '../../../../features/live/odo/domain/odo-contracts.ts';

export type FakeOdoProviderResponses = {
  action: OdoProviderResult<OdoAction>;
  spark: OdoProviderResult<OdoConversationSpark>;
  pulse: OdoProviderResult<OdoAudiencePulse>;
  intermission: OdoProviderResult<string>;
  copilot?: OdoProviderResult<OdoCopilotProviderDraft>;
};

export class FakeOdoProvider implements OdoAIProvider {
  readonly requests: OdoProviderRequest[] = [];
  private readonly responses: FakeOdoProviderResponses;

  constructor(responses: FakeOdoProviderResponses) {
    this.responses = responses;
  }

  decideNextAction(request: OdoProviderRequest) {
    this.requests.push(request);
    return Promise.resolve(this.responses.action);
  }

  generateConversationSpark(request: OdoProviderRequest) {
    this.requests.push(request);
    return Promise.resolve(this.responses.spark);
  }

  generateAudiencePulse(request: OdoProviderRequest) {
    this.requests.push(request);
    return Promise.resolve(this.responses.pulse);
  }

  generateIntermissionCopy(request: OdoProviderRequest) {
    this.requests.push(request);
    return Promise.resolve(this.responses.intermission);
  }

  generateCopilotSuggestion(request: OdoProviderRequest, _task: OdoCopilotTask) {
    this.requests.push(request);
    if (!this.responses.copilot) return Promise.reject(new Error('fake_copilot_response_missing'));
    return Promise.resolve(this.responses.copilot);
  }
}
