const DATE_PLAN_TEXT_PREFIX = 'date_plan::';

const formatDatePlanWhen = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
};

export const getDatePlanPreviewText = (text?: string | null) => {
  if (!text?.startsWith(DATE_PLAN_TEXT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(DATE_PLAN_TEXT_PREFIX.length));
    const placeName =
      typeof parsed?.placeName === 'string' && parsed.placeName.trim()
        ? parsed.placeName.trim()
        : 'a date';
    const when = formatDatePlanWhen(
      typeof parsed?.scheduledFor === 'string' ? parsed.scheduledFor : null,
    );
    return when ? `Date suggestion: ${placeName} ${when}` : `Date suggestion: ${placeName}`;
  } catch {
    return 'Date suggestion';
  }
};
