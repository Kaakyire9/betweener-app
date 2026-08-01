import { Colors } from '@/constants/theme';

import { withAlpha } from './color-utils';

export type DateBadgeTone =
  | 'safe'
  | 'discount'
  | 'surprise'
  | 'nearby'
  | 'area'
  | 'concierge'
  | 'default';

export const getDateBadgeMeta = (badge: string) => {
  const normalized = badge.trim().toLowerCase();
  if (normalized.includes('safe venue')) return { icon: 'shield-check-outline' as const, tone: 'safe' as DateBadgeTone };
  if (normalized.includes('discount')) return { icon: 'ticket-percent-outline' as const, tone: 'discount' as DateBadgeTone };
  if (normalized.includes('surprise')) return { icon: 'party-popper' as const, tone: 'surprise' as DateBadgeTone };
  if (normalized.includes('nearby')) return { icon: 'map-marker-radius-outline' as const, tone: 'nearby' as DateBadgeTone };
  if (normalized.includes('their area')) return { icon: 'home-heart' as const, tone: 'area' as DateBadgeTone };
  if (normalized.includes('concierge') || normalized.includes('betweener help')) {
    return { icon: 'account-tie-hat-outline' as const, tone: 'concierge' as DateBadgeTone };
  }
  return { icon: 'tag-outline' as const, tone: 'default' as DateBadgeTone };
};

export const getDateBadgePalette = ({
  tone,
  theme,
  isDark,
  surface,
  isMyMessage = false,
  confirmed = false,
}: {
  tone: DateBadgeTone;
  theme: typeof Colors.light;
  isDark: boolean;
  surface: 'planner' | 'message';
  isMyMessage?: boolean;
  confirmed?: boolean;
}) => {
  const accent =
    tone === 'safe'
      ? '#2fb36c'
      : tone === 'discount'
        ? '#d4a72c'
        : tone === 'surprise'
          ? '#ef6f91'
          : tone === 'nearby'
            ? '#2c9fb4'
            : tone === 'area'
              ? '#7c8cff'
              : tone === 'concierge'
                ? '#8b6fd6'
                : theme.tint;

  if (surface === 'planner') {
    return {
      backgroundColor: withAlpha(accent, isDark ? 0.18 : 0.1),
      borderColor: withAlpha(accent, isDark ? 0.34 : 0.18),
      foregroundColor: accent,
    };
  }
  if (isMyMessage) {
    return {
      backgroundColor: withAlpha(accent, confirmed ? 0.22 : 0.26),
      borderColor: withAlpha(accent, confirmed ? 0.38 : 0.42),
      foregroundColor: Colors.light.background,
    };
  }
  return {
    backgroundColor: withAlpha(accent, confirmed ? (isDark ? 0.1 : 0.08) : (isDark ? 0.14 : 0.1)),
    borderColor: withAlpha(accent, confirmed ? (isDark ? 0.22 : 0.16) : (isDark ? 0.3 : 0.18)),
    foregroundColor: confirmed && tone === 'default' ? theme.textMuted : accent,
  };
};
