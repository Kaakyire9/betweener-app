import { supabase } from '@/lib/supabase';

const db = supabase as any;

export type ProfileHandleState = {
  username: string | null;
  usernameSearchable: boolean;
  claimedAt: string | null;
  changedAt: string | null;
  nextChangeAt: string | null;
  canRename: boolean;
  cooldownDaysRemaining: number;
};

export type ProfileHandleAvailability = {
  username: string;
  valid: boolean;
  available: boolean;
  ownedByViewer: boolean;
  reason: string | null;
};

export const PROFILE_HANDLE_MIN_LENGTH = 3;
export const PROFILE_HANDLE_MAX_LENGTH = 24;

export function normalizeProfileHandleDraft(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function validateProfileHandleFormat(value: string): string | null {
  const username = normalizeProfileHandleDraft(value);
  if (username.length < PROFILE_HANDLE_MIN_LENGTH) return 'Use at least 3 characters.';
  if (username.length > PROFILE_HANDLE_MAX_LENGTH) return 'Use no more than 24 characters.';
  if (!/[a-z]/.test(username)) return 'Include at least one letter.';
  if (!/^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username)) {
    return 'Use letters, numbers, single periods or underscores.';
  }
  return null;
}

function getProfileHandleFormatReason(value: string): string | null {
  const username = normalizeProfileHandleDraft(value);
  if (username.length < PROFILE_HANDLE_MIN_LENGTH) return 'too_short';
  if (username.length > PROFILE_HANDLE_MAX_LENGTH) return 'too_long';
  if (!/[a-z]/.test(username)) return 'letters_required';
  if (!/^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(username)) return 'invalid_format';
  return null;
}

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const parseHandleState = (value: any): ProfileHandleState => ({
  username: normalizeNullableString(value?.username),
  usernameSearchable: value?.usernameSearchable === true,
  claimedAt: normalizeNullableString(value?.claimedAt),
  changedAt: normalizeNullableString(value?.changedAt),
  nextChangeAt: normalizeNullableString(value?.nextChangeAt),
  canRename: value?.canRename !== false,
  cooldownDaysRemaining: Math.max(0, Number(value?.cooldownDaysRemaining) || 0),
});

const parseAvailability = (value: any): ProfileHandleAvailability => ({
  username: normalizeProfileHandleDraft(String(value?.username || '')),
  valid: value?.valid === true,
  available: value?.available === true,
  ownedByViewer: value?.ownedByViewer === true,
  reason: normalizeNullableString(value?.reason),
});

export function getProfileHandleReasonMessage(reason?: string | null): string {
  switch (reason) {
    case 'too_short':
      return 'Use at least 3 characters.';
    case 'too_long':
      return 'Use no more than 24 characters.';
    case 'invalid_format':
      return 'Use letters, numbers, single periods or underscores.';
    case 'letters_required':
      return 'Include at least one letter.';
    case 'reserved':
      return 'This handle is protected by Betweener.';
    case 'not_allowed':
      return 'Choose a different handle.';
    case 'taken':
      return 'That handle is already part of someone else\'s story.';
    case 'quarantined':
      return 'That handle is resting before it can be claimed again.';
    default:
      return 'That handle is not available.';
  }
}

export function getProfileHandleErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : String((error as any)?.message || error || '');

  if (message.includes('PROFILE_HANDLE_RATE_LIMITED')) {
    return 'Too many checks right now. Give it a few minutes and try again.';
  }
  if (message.includes('PROFILE_HANDLE_COOLDOWN')) {
    return 'Your handle is still inside its 30-day change window.';
  }
  if (message.includes('PROFILE_HANDLE_TAKEN')) {
    return getProfileHandleReasonMessage('taken');
  }
  if (message.includes('PROFILE_HANDLE_QUARANTINED')) {
    return getProfileHandleReasonMessage('quarantined');
  }
  if (message.includes('PROFILE_HANDLE_RESERVED')) {
    return getProfileHandleReasonMessage('reserved');
  }
  if (message.includes('PROFILE_HANDLE_TOO_SHORT')) {
    return getProfileHandleReasonMessage('too_short');
  }
  if (message.includes('PROFILE_HANDLE_TOO_LONG')) {
    return getProfileHandleReasonMessage('too_long');
  }
  if (message.includes('PROFILE_HANDLE_INVALID_FORMAT')) {
    return getProfileHandleReasonMessage('invalid_format');
  }
  if (message.includes('PROFILE_HANDLE_LETTERS_REQUIRED')) {
    return getProfileHandleReasonMessage('letters_required');
  }
  if (message.includes('PROFILE_HANDLE_NOT_ALLOWED') || message.includes('PROFILE_CONTENT_NOT_ALLOWED')) {
    return getProfileHandleReasonMessage('not_allowed');
  }
  if (message.includes('rpc_get_my_profile_handle_state') || message.includes('schema cache')) {
    return 'Handle setup is still arriving. Please try again shortly.';
  }
  return 'We could not update your handle right now.';
}

export async function getMyProfileHandleState(): Promise<ProfileHandleState> {
  const { data, error } = await db.rpc('rpc_get_my_profile_handle_state');
  if (error) throw new Error(error.message || 'Could not load your handle.');
  return parseHandleState(data);
}

export async function checkProfileHandleAvailability(
  value: string,
): Promise<ProfileHandleAvailability> {
  const username = normalizeProfileHandleDraft(value);
  const formatReason = getProfileHandleFormatReason(username);
  if (formatReason) {
    return {
      username,
      valid: false,
      available: false,
      ownedByViewer: false,
      reason: formatReason,
    };
  }

  const { data, error } = await db.rpc('rpc_check_profile_username_availability', {
    p_username: username,
  });
  if (error) throw new Error(error.message || 'Could not check that handle.');
  return parseAvailability(data);
}

export async function updateMyProfileHandle(
  value: string,
  usernameSearchable: boolean,
): Promise<ProfileHandleState> {
  const username = normalizeProfileHandleDraft(value);
  const { data, error } = await db.rpc('rpc_update_my_profile_username', {
    p_username: username,
    p_searchable: usernameSearchable,
  });
  if (error) throw new Error(error.message || 'Could not update your handle.');
  return parseHandleState(data);
}
