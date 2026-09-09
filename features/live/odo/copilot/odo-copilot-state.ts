import type {
  OdoCopilotState,
  OdoCopilotSuggestion,
  OdoCopilotTask,
} from './odo-copilot-contracts.ts';
import { isOdoCopilotSuggestionExpired } from './odo-copilot-validation.ts';

export type OdoCopilotViewState = {
  remote: OdoCopilotState | null;
  current: OdoCopilotSuggestion | null;
  recent: readonly OdoCopilotSuggestion[];
  loading: boolean;
  busyTask: OdoCopilotTask | 'use' | 'dismiss' | null;
  error: string | null;
};

export type OdoCopilotViewAction =
  | { type: 'loading' }
  | { type: 'loaded'; state: OdoCopilotState; now?: Date }
  | { type: 'requesting'; task: OdoCopilotTask }
  | { type: 'received'; suggestion: OdoCopilotSuggestion }
  | { type: 'using' }
  | { type: 'dismissing' }
  | { type: 'resolved'; suggestionId: string; status: 'used' | 'dismissed' | 'superseded' }
  | { type: 'expired'; suggestionId: string }
  | { type: 'failed'; message: string }
  | { type: 'clear_error' };

export const INITIAL_ODO_COPILOT_VIEW_STATE: OdoCopilotViewState = {
  remote: null,
  current: null,
  recent: [],
  loading: false,
  busyTask: null,
  error: null,
};

const splitSuggestions = (
  suggestions: readonly OdoCopilotSuggestion[],
  now = new Date(),
) => {
  const current = suggestions.find((suggestion) =>
    suggestion.status === 'ready' && !isOdoCopilotSuggestionExpired(suggestion, now)) ?? null;
  return { current, recent: suggestions.filter((suggestion) => suggestion.id !== current?.id) };
};

export const odoCopilotViewReducer = (
  state: OdoCopilotViewState,
  action: OdoCopilotViewAction,
): OdoCopilotViewState => {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: null };
    case 'loaded': {
      const suggestions = splitSuggestions(action.state.suggestions, action.now);
      return { ...state, remote: action.state, ...suggestions, loading: false, busyTask: null, error: null };
    }
    case 'requesting':
      return { ...state, busyTask: action.task, error: null };
    case 'received':
      return {
        ...state,
        current: action.suggestion,
        recent: state.current ? [state.current, ...state.recent].slice(0, 10) : state.recent,
        busyTask: null,
        error: null,
      };
    case 'using':
      return { ...state, busyTask: 'use', error: null };
    case 'dismissing':
      return { ...state, busyTask: 'dismiss', error: null };
    case 'resolved': {
      const resolved = state.current?.id === action.suggestionId
        ? { ...state.current, status: action.status }
        : null;
      return {
        ...state,
        current: resolved ? null : state.current,
        recent: resolved ? [resolved, ...state.recent].slice(0, 10) : state.recent,
        busyTask: null,
        error: null,
      };
    }
    case 'expired': {
      if (state.current?.id !== action.suggestionId) return state;
      const expired = { ...state.current, status: 'expired' as const };
      return { ...state, current: null, recent: [expired, ...state.recent].slice(0, 10), busyTask: null };
    }
    case 'failed':
      return { ...state, loading: false, busyTask: null, error: action.message };
    case 'clear_error':
      return { ...state, error: null };
  }
};
