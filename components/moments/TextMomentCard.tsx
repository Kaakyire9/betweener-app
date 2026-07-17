import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import {
  getMomentTextBodyStyle,
  getMomentTextTheme,
  sanitizeMomentTextStyle,
  type MomentMetadata,
} from '@/lib/moment-text-style';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  body: string;
  caption?: string | null;
  metadata?: MomentMetadata | null;
  eyebrow?: string | null;
  bodyNumberOfLines?: number;
  captionNumberOfLines?: number;
  variant?: 'editor' | 'viewer' | 'success';
  style?: StyleProp<ViewStyle>;
};

export default function TextMomentCard({
  body,
  caption,
  metadata,
  eyebrow,
  bodyNumberOfLines,
  captionNumberOfLines,
  variant = 'viewer',
  style,
}: Props) {
  const textStyle = useMemo(() => sanitizeMomentTextStyle(metadata?.text_style), [metadata]);
  const theme = useMemo(() => getMomentTextTheme(textStyle), [textStyle]);
  const bodyDecorations = useMemo(() => getMomentTextBodyStyle(textStyle), [textStyle]);
  const isViewer = variant === 'viewer';
  const isSuccess = variant === 'success';

  return (
    <LinearGradientSafe
      colors={[...theme.gradient]}
      start={[0, 0]}
      end={[1, 1]}
      style={[
        styles.card,
        {
          backgroundColor: theme.gradient[0],
          borderColor: theme.borderColor,
        },
        style,
      ]}
    >
      <View style={[styles.glow, { backgroundColor: theme.chipColor }]} />
      {eyebrow ? (
        <View style={[styles.eyebrowChip, { backgroundColor: theme.chipColor, borderColor: theme.borderColor }]}>
          <Text style={[styles.eyebrowText, { color: theme.captionColor }]}>{eyebrow}</Text>
        </View>
      ) : null}
      <Text
        numberOfLines={bodyNumberOfLines}
        style={[
          styles.body,
          isViewer ? styles.bodyViewer : isSuccess ? styles.bodySuccess : styles.bodyEditor,
          bodyDecorations,
          { color: theme.textColor },
        ]}
      >
        {body}
      </Text>
      {caption ? (
        <View style={[styles.captionWrap, { borderTopColor: theme.borderColor }]}>
          <Text
            numberOfLines={captionNumberOfLines}
            style={[
              styles.caption,
              isViewer ? styles.captionViewer : null,
              { color: theme.captionColor },
            ]}
          >
            {caption}
          </Text>
        </View>
      ) : null}
    </LinearGradientSafe>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  glow: {
    position: 'absolute',
    right: -24,
    top: -20,
    width: 120,
    height: 120,
    borderRadius: 999,
    opacity: 0.35,
  },
  eyebrowChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
  },
  eyebrowText: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  body: {
    letterSpacing: 0.1,
  },
  bodyEditor: {
    fontSize: 18,
    lineHeight: 27,
  },
  bodyViewer: {
    fontSize: 29,
    lineHeight: 38,
  },
  bodySuccess: {
    fontSize: 20,
    lineHeight: 29,
  },
  captionWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  caption: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    lineHeight: 19,
  },
  captionViewer: {
    fontSize: 14,
    lineHeight: 20,
  },
});
