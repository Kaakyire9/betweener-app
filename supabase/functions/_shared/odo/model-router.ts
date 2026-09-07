import type { OdoTask } from './provider.ts';

export type OdoModelClass = 'luna' | 'terra' | 'sol';
export type OdoComplexity = 'routine' | 'complex' | 'offline';

export type OdoModelRoute = {
  modelClass: OdoModelClass;
  model: string;
  reasonCode: 'routine_default' | 'complex_escalation' | 'offline_fallback';
  synchronousProviderAllowed: boolean;
};

export type OdoModelRouterEnvironment = {
  ODO_LUNA_MODEL?: string;
  ODO_TERRA_MODEL?: string;
  ODO_SOL_MODEL?: string;
};

const normalized = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export class OdoModelRouter {
  private readonly environment: OdoModelRouterEnvironment;

  constructor(environment: OdoModelRouterEnvironment) {
    this.environment = environment;
  }

  route(task: OdoTask, complexity: OdoComplexity = 'routine'): OdoModelRoute {
    if (complexity === 'offline') {
      return {
        modelClass: 'sol',
        model: normalized(this.environment.ODO_SOL_MODEL, 'gpt-5.6-sol'),
        reasonCode: 'offline_fallback',
        synchronousProviderAllowed: false,
      };
    }

    if (complexity === 'complex' && task !== 'audience_pulse') {
      return {
        modelClass: 'terra',
        model: normalized(this.environment.ODO_TERRA_MODEL, 'gpt-5.6-terra'),
        reasonCode: 'complex_escalation',
        synchronousProviderAllowed: true,
      };
    }

    return {
      modelClass: 'luna',
      model: normalized(this.environment.ODO_LUNA_MODEL, 'gpt-5.6-luna'),
      reasonCode: 'routine_default',
      synchronousProviderAllowed: true,
    };
  }
}
