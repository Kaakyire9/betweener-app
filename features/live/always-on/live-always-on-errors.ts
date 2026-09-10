const includesCode = (value: string, code: string) =>
  value.toLowerCase().includes(code);

export const getLiveAlwaysOnAvailabilityErrorMessage = (
  error: string | null,
): string | null => {
  if (!error) return null;
  if (includesCode(error, 'live_availability_profile_ineligible')) {
    return 'Complete your profile verification before becoming available.';
  }
  if (includesCode(error, 'live_availability_active_live_conflict')) {
    return 'Leave your current Live or Private Spark before becoming available.';
  }
  if (includesCode(error, 'live_availability_unavailable')) {
    return 'Available Now is not open for this account yet.';
  }
  if (includesCode(error, 'live_availability_duration_invalid')) {
    return 'That time option has changed. Refresh Live and choose again.';
  }
  if (includesCode(error, 'unauthenticated')
    || includesCode(error, 'client_timeout')) {
    return 'Reconnect securely, then try again.';
  }
  return 'Could not update availability. Please try again.';
};
