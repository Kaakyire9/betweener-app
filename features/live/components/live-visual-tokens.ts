import { Colors } from '@/constants/theme.ts';
import { useColorScheme } from '@/hooks/use-color-scheme.ts';

type LiveVisualColors = {
  canvas: string;
  bgSubtle: string;
  surface: string;
  surfaceRaised: string;
  surfaceSoft: string;
  surfaceTranslucent: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  teal: string;
  tealSoft: string;
  purple: string;
  purpleSoft: string;
  oat: string;
  gold: string;
  accentContrast: string;
  danger: string;
  dangerSoft: string;
  dangerText: string;
  warning: string;
  warningSoft: string;
  success: string;
  scrim: string;
  videoChrome: string;
};

export type LiveVisualTheme = LiveVisualColors & {
  scheme: 'light' | 'dark';
  isDark: boolean;
  color: LiveVisualColors;
  radius: {
    panel: number;
    dock: number;
    pill: number;
  };
};

const radius = {
  panel: 24,
  dock: 30,
  pill: 999,
} as const;

const createLiveVisualTheme = (
  scheme: 'light' | 'dark',
  color: LiveVisualColors,
): LiveVisualTheme => ({ scheme, isDark: scheme === 'dark', color, ...color, radius });

/** Live follows the same Intentional Connection palette as the rest of Betweener. */
export const LIVE_VISUAL_THEMES: Readonly<Record<'light' | 'dark', LiveVisualTheme>> = {
  light: createLiveVisualTheme('light', {
      canvas: Colors.light.background,
      bgSubtle: Colors.light.backgroundSubtle,
      surface: Colors.light.backgroundSubtle,
      surfaceRaised: '#FFFDFC',
      surfaceSoft: '#E4EFEB',
      surfaceTranslucent: '#FFFDFCEB',
      border: Colors.light.outline,
      borderStrong: '#00808042',
      text: Colors.light.text,
      textMuted: Colors.light.textMuted,
      teal: Colors.light.tint,
      tealSoft: '#0080801A',
      purple: Colors.light.accent,
      purpleSoft: '#7D5BA61A',
      oat: Colors.light.backgroundSubtle,
      gold: Colors.light.tint,
      accentContrast: '#FFFFFF',
      danger: Colors.light.danger,
      dangerSoft: '#FDE8E7',
      dangerText: '#7F1D1D',
      warning: '#9A5B13',
      warningSoft: '#F8E8CF',
      success: '#087B6C',
      scrim: '#0F1A1A80',
      videoChrome: '#0B1716',
    }),
  dark: createLiveVisualTheme('dark', {
      canvas: Colors.dark.background,
      bgSubtle: Colors.dark.backgroundSubtle,
      surface: Colors.dark.backgroundSubtle,
      surfaceRaised: '#1A2C2A',
      surfaceSoft: '#18312F',
      surfaceTranslucent: '#142624EB',
      border: '#5BC1BB24',
      borderStrong: '#5BC1BB52',
      text: Colors.light.backgroundSubtle,
      textMuted: Colors.dark.textMuted,
      teal: Colors.dark.tint,
      tealSoft: '#00A0A026',
      purple: Colors.dark.accent,
      purpleSoft: '#9B7CC826',
      oat: Colors.light.background,
      gold: Colors.dark.tint,
      accentContrast: '#071211',
      danger: Colors.dark.danger,
      dangerSoft: '#512A2D',
      dangerText: '#FFEDEC',
      warning: '#F3B76B',
      warningSoft: '#4B341F',
      success: Colors.dark.secondary,
      scrim: '#071110B8',
      videoChrome: '#071211',
    }),
};

/** Backward-compatible dark tokens for media-only components not yet themed. */
export const LIVE_VISUAL = LIVE_VISUAL_THEMES.dark;

export function useLiveVisualTheme(): LiveVisualTheme {
  return LIVE_VISUAL_THEMES[useColorScheme()];
}
