import { BarChart3, ChevronRight, UserRoundPlus, X } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';

export type LiveRoomEventNoticeKind = 'stage_request' | 'audience_pulse';

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
  const Icon = kind === 'stage_request' ? UserRoundPlus : BarChart3;
  return (
    <LiveGlassSurface intensity={60} style={styles.surface}>
      <View accessibilityLiveRegion="assertive" style={styles.notice}>
        <View style={styles.iconShell}>
          <Icon color="#E2C173" size={19} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>
            {kind === 'stage_request' ? 'STAGE REQUEST' : 'AUDIENCE PULSE'}
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
          <ChevronRight color="#102522" size={15} />
        </Pressable>
        <Pressable
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <X color="#9EB0AB" size={16} />
        </Pressable>
      </View>
    </LiveGlassSurface>
  );
});

const styles = StyleSheet.create({
  surface: {
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 19,
    borderColor: '#D7B56D66',
    backgroundColor: '#0B201DDD',
  },
  notice: {
    minHeight: 70,
    paddingLeft: 10,
    paddingRight: 34,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  iconShell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7B56D1C',
    borderWidth: 1,
    borderColor: '#D7B56D3D',
  },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#D7B56D', fontSize: 7, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 2, color: '#FFF7EC', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  body: { marginTop: 1, color: '#9FB1AC', fontSize: 9, fontFamily: 'Manrope_500Medium' },
  action: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#D7B56D',
  },
  actionText: { color: '#102522', fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
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
