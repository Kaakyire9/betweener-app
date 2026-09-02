import { supabase } from '@/lib/supabase';

export type GuardedProfilePromptInput = {
  prompt_key: string;
  prompt_title: string;
  answer: string;
  prompt_type?: 'standard' | 'guess';
  guess_mode?: string | null;
  guess_options?: unknown[] | null;
  hint_text?: string | null;
  reveal_policy?: string;
};

export const insertGuardedProfilePrompt = async (prompt: GuardedProfilePromptInput) => {
  const { data, error } = await supabase.functions.invoke('profile-guard-update', {
    body: { updates: {}, prompt },
  });
  if (error) return { error };
  if (data?.ok === false) {
    return {
      error: Object.assign(new Error('Keep your profile personal'), {
        code: data.code ?? 'PROFILE_CONTENT_NOT_ALLOWED',
      }),
    };
  }
  return { error: null };
};
