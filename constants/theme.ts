/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Intentional Connection palette (teal/oat milk/purple)
const tintColorPrimary = '#008080';
const secondaryColor = '#4FA7A3';
const accentColor = '#7D5BA6';

export const Colors = {
  light: {
    text: '#1F2A2A',
    textMuted: '#5F706C',
    background: '#F3E5D8',
    backgroundSubtle: '#F7ECE2',
    tint: tintColorPrimary,
    secondary: secondaryColor,
    accent: accentColor,
    outline: '#DCCFC2',
    icon: '#5F706C',
    tabIconDefault: '#5F706C',
    tabIconSelected: tintColorPrimary,
  },
  dark: {
    text: '#E8F0ED',
    textMuted: '#9CB3AE',
    background: '#0F1A1A',
    backgroundSubtle: '#152222',
    tint: '#00A0A0',
    secondary: '#5BC1BB',
    accent: '#9B7CC8',
    outline: '#1F2C2C',
    icon: '#9CB3AE',
    tabIconDefault: '#9CB3AE',
    tabIconSelected: '#00A0A0',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
