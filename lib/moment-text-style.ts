import { Platform, type TextStyle } from 'react-native';

export type MomentTextFontId = 'sans' | 'serif' | 'mono';
export type MomentTextThemeId = 'midnight' | 'teal' | 'sunset' | 'plum' | 'linen';

export type MomentTextStyle = {
  font: MomentTextFontId;
  themeId: MomentTextThemeId;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
};

export type MomentMetadata = {
  text_style?: Partial<MomentTextStyle> | null;
} & Record<string, unknown>;

type MomentThemeSpec = {
  id: MomentTextThemeId;
  label: string;
  gradient: [string, string, ...string[]];
  textColor: string;
  captionColor: string;
  borderColor: string;
  chipColor: string;
};

export const MOMENT_TEXT_THEMES: MomentThemeSpec[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    gradient: ['#0d1417', '#122126'],
    textColor: '#f8fcfb',
    captionColor: 'rgba(235,245,242,0.78)',
    borderColor: 'rgba(91,193,187,0.18)',
    chipColor: '#0f1d20',
  },
  {
    id: 'teal',
    label: 'Teal',
    gradient: ['#113135', '#1a4a4b'],
    textColor: '#f7fffd',
    captionColor: 'rgba(235,252,247,0.8)',
    borderColor: 'rgba(129,231,224,0.22)',
    chipColor: '#1b4d51',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    gradient: ['#5a2d28', '#c36f46'],
    textColor: '#fff8f3',
    captionColor: 'rgba(255,242,233,0.82)',
    borderColor: 'rgba(255,213,184,0.24)',
    chipColor: '#9f5939',
  },
  {
    id: 'plum',
    label: 'Plum',
    gradient: ['#332145', '#5f4284'],
    textColor: '#faf7ff',
    captionColor: 'rgba(241,232,255,0.8)',
    borderColor: 'rgba(204,183,255,0.22)',
    chipColor: '#533b74',
  },
  {
    id: 'linen',
    label: 'Linen',
    gradient: ['#d9ccb7', '#f1e4d1'],
    textColor: '#241d16',
    captionColor: 'rgba(36,29,22,0.7)',
    borderColor: 'rgba(36,29,22,0.1)',
    chipColor: '#e6d7c2',
  },
] as const;

export const DEFAULT_MOMENT_TEXT_STYLE: MomentTextStyle = {
  font: 'sans',
  themeId: 'midnight',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
};

export const MOMENT_TEXT_FONT_OPTIONS: { id: MomentTextFontId; label: string }[] = [
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
];

export const sanitizeMomentTextStyle = (input: unknown): MomentTextStyle => {
  const source = input && typeof input === 'object' ? (input as Partial<MomentTextStyle>) : {};
  const font: MomentTextFontId =
    source.font === 'serif' || source.font === 'mono' || source.font === 'sans'
      ? source.font
      : DEFAULT_MOMENT_TEXT_STYLE.font;
  const themeId: MomentTextThemeId = MOMENT_TEXT_THEMES.some((theme) => theme.id === source.themeId)
    ? (source.themeId as MomentTextThemeId)
    : DEFAULT_MOMENT_TEXT_STYLE.themeId;

  return {
    font,
    themeId,
    bold: Boolean(source.bold),
    italic: Boolean(source.italic),
    underline: Boolean(source.underline),
    strike: Boolean(source.strike),
  };
};

export const getMomentTextTheme = (style: MomentTextStyle) =>
  MOMENT_TEXT_THEMES.find((theme) => theme.id === style.themeId) ?? MOMENT_TEXT_THEMES[0];

export const getMomentTextDecoration = (style: MomentTextStyle) => {
  if (style.underline && style.strike) return 'underline line-through' as const;
  if (style.underline) return 'underline' as const;
  if (style.strike) return 'line-through' as const;
  return 'none' as const;
};

export const getMomentTextFontFamily = (style: MomentTextStyle) => {
  if (style.font === 'serif') {
    if (style.italic) return style.bold ? 'PlayfairDisplay_700Bold_Italic' : 'PlayfairDisplay_600SemiBold_Italic';
    return style.bold ? 'PlayfairDisplay_700Bold' : 'PlayfairDisplay_600SemiBold';
  }
  if (style.font === 'mono') {
    return Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    });
  }
  return style.bold ? 'Manrope_700Bold' : 'Manrope_600SemiBold';
};

export const getMomentTextBodyStyle = (style: MomentTextStyle): TextStyle => {
  const nextStyle: TextStyle = {
    fontFamily: getMomentTextFontFamily(style),
    fontStyle: style.italic && style.font !== 'serif' ? 'italic' : 'normal',
    textDecorationLine: getMomentTextDecoration(style),
    fontWeight: style.font === 'mono' ? (style.bold ? '700' : '500') : undefined,
  };

  if (style.italic && style.font !== 'serif') {
    nextStyle.transform = [{ skewX: '-8deg' }];
  }

  return nextStyle;
};
