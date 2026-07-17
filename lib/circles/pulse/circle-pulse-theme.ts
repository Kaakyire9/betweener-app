import { useMemo } from 'react';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Scheme = 'light' | 'dark';

const alpha = (hex: string, opacity: number) => {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return hex;
  const value = Number.parseInt(cleanHex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${opacity})`;
};

export const getCirclePulsePalette = (scheme: Scheme) => {
  const theme = Colors[scheme];
  const dark = scheme === 'dark';

  return {
    dark,
    text: dark ? '#F4E8D0' : theme.text,
    textMuted: dark ? '#91B7B5' : theme.textMuted,
    textSoft: dark ? 'rgba(244,232,208,0.74)' : alpha(theme.text, 0.72),
    textFaint: dark ? 'rgba(244,232,208,0.42)' : alpha(theme.text, 0.46),
    surface: dark ? '#071E22' : theme.backgroundSubtle,
    surfaceStrong: dark ? '#0A2225' : '#FFF9F3',
    surfaceMuted: dark ? 'rgba(2,17,20,0.3)' : alpha(theme.background, 0.72),
    overlay: dark ? 'rgba(0,10,12,0.64)' : 'rgba(31,42,42,0.3)',
    teal: dark ? '#6FE4E1' : theme.tint,
    tealStrong: dark ? '#13A8A8' : theme.tint,
    tealInk: dark ? '#071E22' : '#FFFFFF',
    tealSoft: alpha(dark ? '#13A8A8' : theme.tint, dark ? 0.14 : 0.1),
    tealBorder: alpha(dark ? '#6FE4E1' : theme.tint, dark ? 0.32 : 0.24),
    purple: dark ? '#C7A8FF' : theme.accent,
    purpleStrong: dark ? '#8B5CFF' : theme.accent,
    purpleSoft: alpha(dark ? '#8B5CFF' : theme.accent, dark ? 0.16 : 0.1),
    purpleBorder: alpha(dark ? '#8B5CFF' : theme.accent, dark ? 0.48 : 0.3),
    outline: dark ? 'rgba(244,232,208,0.14)' : theme.outline,
    outlineSoft: dark ? 'rgba(244,232,208,0.1)' : alpha(theme.text, 0.1),
    danger: dark ? '#E88A95' : theme.danger,
    warning: dark ? '#E7C77E' : '#A16207',
    overlayText: '#F4E8D0',
    gradient: dark
      ? (['rgba(7,30,34,0.98)', 'rgba(11,45,48,0.94)', 'rgba(16,31,43,0.98)'] as const)
      : (['rgba(255,249,243,0.99)', 'rgba(247,236,226,0.98)', 'rgba(237,247,245,0.99)'] as const),
    viewerGradient: dark
      ? (['rgba(2,17,20,0.98)', 'rgba(7,30,34,0.96)', 'rgba(16,31,43,0.98)'] as const)
      : (['rgba(255,249,243,0.99)', 'rgba(247,236,226,0.98)', 'rgba(237,247,245,0.99)'] as const),
    fallbackGradient: dark
      ? (['rgba(19,168,168,0.35)', 'rgba(11,36,39,0.92)'] as const)
      : (['rgba(0,128,128,0.24)', 'rgba(247,236,226,0.96)'] as const),
    warmIntroGradient: dark
      ? (['rgba(42,14,68,0.88)', 'rgba(16,42,54,0.94)'] as const)
      : (['rgba(242,232,255,0.98)', 'rgba(237,247,245,0.98)'] as const),
    gatheringGradient: dark
      ? (['rgba(21,45,60,0.94)', 'rgba(11,36,39,0.96)'] as const)
      : (['rgba(234,246,247,0.99)', 'rgba(247,236,226,0.98)'] as const),
    promptGradient: dark
      ? (['rgba(12,48,50,0.96)', 'rgba(11,36,39,0.96)'] as const)
      : (['rgba(231,247,244,0.99)', 'rgba(255,249,243,0.98)'] as const),
    gistGradient: dark
      ? (['rgba(25,18,52,0.92)', 'rgba(10,30,34,0.94)'] as const)
      : (['rgba(243,236,255,0.99)', 'rgba(237,247,245,0.98)'] as const),
  };
};

export const useCirclePulsePalette = () => {
  const colorScheme = useColorScheme();
  return useMemo(
    () => getCirclePulsePalette(colorScheme === 'dark' ? 'dark' : 'light'),
    [colorScheme],
  );
};

export type CirclePulsePalette = ReturnType<typeof getCirclePulsePalette>;
