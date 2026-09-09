import { BarChart3, ChevronRight, Sparkles, UserRoundPlus, X } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export type LiveRoomEventNoticeKind = 'stage_request' | 'audience_pulse' | 'odo_copilot';

type Props = {
  actionLabel: string;
  body: string;
  kind: LiveRoomEventNoticeKind;
  onAction: () => void;
  onDismiss: () => void;
  title: string;
};

/** Actionable room event that never owns or mutates the durable event itself. */
export const LiveRoomEventNotice = memo(function LiveRoomEventNotice({
  actionLabel,
  body,
  kind,
  onAction,
  onDismiss,
  title,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const Icon = kind === 'stage_request'
    ? UserRoundPlus
    : kind === 'audience_pulse' ? BarChart3 : Sparkles;
  return (
    <LiveGlassSurface intensity={60} style={styles.surface}>
      <View accessibilityLiveRegion="assertive" style={styles.notice}>
        <View style={styles.iconShell}>
          <Icon color={visual.color.purple} size={18} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>
            {kind === 'stage_request'
              ? 'STAGE REQUEST'
              : kind === 'audience_pulse' ? 'AUDIENCE PULSE' : 'FROM THE HOST'}
          </Text>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.body}>
            {body}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={styles.action}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <ChevronRight color={visual.color.accentContrast} size={15} />
        </Pressable>
        <Pressable
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <X color={visual.color.textMuted} size={16} />
        </Pressable>
      </View>
    </LiveGlassSurface>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  surface: {
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 17,
    borderColor: visual.color.borderStrong,
    backgroundColor: visual.color.surfaceTranslucent,
  },
  notice: {
    minHeight: 60,
    paddingLeft: 9,
    paddingRight: 32,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  iconShell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.purpleSoft,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: visual.color.purple, fontSize: 7, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 2, color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  body: { marginTop: 1, color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_500Medium' },
  action: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: visual.color.purple,
  },
  actionText: { color: visual.color.accentContrast, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  dismiss: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
