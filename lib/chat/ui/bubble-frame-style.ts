import type { ViewStyle } from 'react-native';
import { Platform, StyleSheet } from 'react-native';

import type { ChatBubbleFramePolicy } from './bubble-frame-policy';
import { withAlpha } from './color-utils';

const FAILED_FRAME = '#D96D78';
const PENDING_FRAME = '#8B9998';

/**
 * Shared visual treatment for both bubble-owned and media-owned frames.
 * It never adds spacing, so the outline follows the content silhouette.
 */
export const getChatBubbleFrameStyle = (
  policy: ChatBubbleFramePolicy,
  isDark: boolean,
): ViewStyle => {
  if (policy.role === 'none') {
    return {
      borderWidth: 0,
      borderColor: 'transparent',
      shadowOpacity: 0,
      elevation: 0,
    };
  }

  const accent = policy.deliveryTone === 'failed'
    ? FAILED_FRAME
    : policy.deliveryTone === 'pending'
      ? PENDING_FRAME
      : policy.accentColor;
  const isMedia = policy.role === 'media';
  const outlineAlpha = policy.deliveryTone === 'settled'
      ? isMedia
      ? (isDark ? 0.52 : 0.42)
      : policy.role === 'text'
        ? (isDark ? 0.34 : 0.25)
        : (isDark ? 0.25 : 0.18)
    : isDark
      ? 0.5
      : 0.4;

  return {
    borderWidth: isMedia ? 1 : StyleSheet.hairlineWidth,
    borderColor: withAlpha(accent, outlineAlpha),
    shadowColor: accent,
    shadowOffset: { width: 0, height: isMedia ? 3 : 1 },
    // Android elevation rasterizes transparent recycled surfaces and can
    // leave a phantom rectangular layer. Keep its premium treatment to the
    // crisp accent outline; iOS safely supports the restrained soft halo.
    shadowOpacity: policy.glow && Platform.OS === 'ios' ? (isDark ? 0.14 : 0.09) : 0,
    shadowRadius: policy.glow && Platform.OS === 'ios' ? (isDark ? 7 : 5) : 0,
    elevation: 0,
  };
};
