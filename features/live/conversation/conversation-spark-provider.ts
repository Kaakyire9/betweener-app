import type { LiveConversationSpark } from '../application/live-models.ts';

export type ConversationSparkContext = {
  serverSpark: LiveConversationSpark | null;
};

export interface ConversationSparkProvider {
  getPrompts(context: ConversationSparkContext): readonly LiveConversationSpark[];
}

const FALLBACK_SPARKS: readonly LiveConversationSpark[] = [
  {
    context: 'A gentle place to begin',
    question: 'What does a peaceful relationship look like to you?',
  },
  {
    context: 'Looking ahead',
    question: "What is something you're building toward right now?",
  },
  {
    context: 'The life you want to share',
    question: "What's a tradition you'd want in your future home?",
  },
];

export const deterministicConversationSparkProvider: ConversationSparkProvider = {
  getPrompts: ({ serverSpark }) => serverSpark
    ? [serverSpark, ...FALLBACK_SPARKS]
    : FALLBACK_SPARKS,
};
