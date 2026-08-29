import * as Haptics from 'expo-haptics';
import { Heart, ShieldCheck, Sparkles, X } from 'lucide-react-native';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveConversationSpark } from '../application/live-models.ts';
import type { PrivateSparkMilestone } from '../hooks/use-private-spark-milestones.ts';
import { LiveGlassSurface } from './LiveGlassSurface.tsx';

export const LivePrivateSparkEntryMoment = memo(function LivePrivateSparkEntryMoment({
  onComplete,
  reduceMotion,
}: {
  onComplete: () => void;
  reduceMotion: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.96)).current;

  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: reduceMotion ? 1 : 420, useNativeDriver: true }),
      ]),
      Animated.delay(1_150),
      Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onComplete();
    });
    return () => animation.stop();
  }, [onComplete, opacity, reduceMotion, scale]);

  return (
    <Animated.View pointerEvents="none" style={[styles.entry, { opacity, transform: [{ scale }] }]}>
      <LiveGlassSurface intensity={58} style={styles.entryCard}>
        <View style={styles.heartMark}>
          <Heart color="#BFA9E8" fill="#8B73D666" size={20} />
        </View>
        <Text style={styles.entryEyebrow}>PRIVATE SPARK</Text>
        <Text style={styles.entryTitle}>Only you two are here.</Text>
        <Text style={styles.entryCopy}>Media is encrypted in transit.</Text>
      </LiveGlassSurface>
    </Animated.View>
  );
});

export const LivePrivateSparkMilestoneToast = memo(function LivePrivateSparkMilestoneToast({
  milestone,
}: {
  milestone: PrivateSparkMilestone;
}) {
  if (!milestone) return null;
  return (
    <LiveGlassSurface intensity={50} style={styles.toast}>
      <Sparkles color="#CBB9ED" size={14} />
      <Text style={styles.toastText}>
        {milestone === 'one_minute' ? 'One minute remaining' : 'Your Spark is almost complete'}
      </Text>
    </LiveGlassSurface>
  );
});

const Sheet = ({ children, onClose, visible }: { children: ReactNode; onClose: () => void; visible: boolean }) => (
  <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.backdrop}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
        {children}
      </Pressable>
    </Pressable>
  </Modal>
);

export const LivePrivateSparkEndSheet = ({
  onCancel,
  onConfirm,
  visible,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}) => (
  <Sheet onClose={onCancel} visible={visible}>
    <Text style={styles.sheetEyebrow}>PRIVATE SPARK</Text>
    <Text style={styles.sheetTitle}>End this Private Spark?</Text>
    <Text style={styles.sheetCopy}>You can leave immediately whenever you need to.</Text>
    <Pressable onPress={onCancel} style={styles.primaryAction}><Text style={styles.primaryActionText}>Keep talking</Text></Pressable>
    <Pressable onPress={onConfirm} style={styles.dangerAction}><Text style={styles.dangerActionText}>End Spark</Text></Pressable>
  </Sheet>
);

export const LivePrivateSparkConversationSheet = ({
  onAnother,
  onClose,
  prompt,
  visible,
}: {
  onAnother: () => void;
  onClose: () => void;
  prompt: LiveConversationSpark;
  visible: boolean;
}) => (
  <Sheet onClose={onClose} visible={visible}>
    <View style={styles.sheetHeadingRow}>
      <View style={styles.sparkIcon}><Sparkles color="#D6C5F3" size={16} /></View>
      <View style={styles.sheetHeadingCopy}>
        <Text style={styles.sheetEyebrow}>CONVERSATION SPARK</Text>
        <Text style={styles.promptContext}>{prompt.context}</Text>
      </View>
      <Pressable accessibilityLabel="Close Conversation Spark" onPress={onClose} style={styles.close}><X color="#EDE4D5" size={18} /></Pressable>
    </View>
    <Text style={styles.promptQuestion}>{prompt.question}</Text>
    <View style={styles.inlineActions}>
      <Pressable onPress={onAnother} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Another</Text></Pressable>
      <Pressable onPress={onClose} style={styles.primaryInline}><Text style={styles.primaryActionText}>Close</Text></Pressable>
    </View>
  </Sheet>
);

export type PrivateSparkOptionsView = 'menu' | 'privacy' | 'help' | 'report' | 'block';

export const LivePrivateSparkOptionsSheet = ({
  busy,
  onBlock,
  onClose,
  onLeave,
  onReport,
  onViewChange,
  view,
  visible,
}: {
  busy: boolean;
  onBlock: () => void;
  onClose: () => void;
  onLeave: () => void;
  onReport: (reason: string) => void;
  onViewChange: (view: PrivateSparkOptionsView) => void;
  view: PrivateSparkOptionsView;
  visible: boolean;
}) => {
  const back = () => view === 'menu' ? onClose() : onViewChange('menu');
  return (
    <Sheet onClose={back} visible={visible}>
      <View style={styles.sheetHeadingRow}>
        <ShieldCheck color="#80CDBB" size={19} />
        <Text style={[styles.sheetTitle, styles.sheetTitleInline]}>Private Spark options</Text>
        <Pressable accessibilityLabel="Close options" onPress={onClose} style={styles.close}><X color="#EDE4D5" size={18} /></Pressable>
      </View>
      {view === 'menu' ? (
        <View style={styles.menuList}>
          <Pressable onPress={() => onViewChange('report')} style={styles.menuItem}><Text style={styles.menuText}>Report</Text></Pressable>
          <Pressable onPress={() => onViewChange('block')} style={styles.menuItem}><Text style={styles.menuText}>Block</Text></Pressable>
          <Pressable onPress={() => onViewChange('help')} style={styles.menuItem}><Text style={styles.menuText}>Connection help</Text></Pressable>
          <Pressable onPress={() => onViewChange('privacy')} style={styles.menuItem}><Text style={styles.menuText}>Privacy information</Text></Pressable>
          <Pressable disabled={busy} onPress={onLeave} style={styles.leaveItem}><Text style={styles.leaveText}>Leave Private Spark</Text></Pressable>
        </View>
      ) : null}
      {view === 'privacy' ? (
        <View><Text style={styles.infoTitle}>A room for only two</Text><Text style={styles.sheetCopy}>Only the two introduced participants can enter. Your Host cannot hear or watch this conversation. Media is encrypted in transit and Betweener does not record this Spark.</Text><Pressable onPress={back} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Back</Text></Pressable></View>
      ) : null}
      {view === 'help' ? (
        <View><Text style={styles.infoTitle}>Connection help</Text><Text style={styles.sheetCopy}>If the connection becomes unstable, keep audio on and try turning video off. Betweener will preserve the private room while it reconnects.</Text><Pressable onPress={back} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Back</Text></Pressable></View>
      ) : null}
      {view === 'report' ? (
        <View><Text style={styles.infoTitle}>What happened?</Text>{['inappropriate_behaviour', 'harassment', 'safety_concern'].map((reason) => <Pressable disabled={busy} key={reason} onPress={() => onReport(reason)} style={styles.menuItem}><Text style={styles.menuText}>{reason.replaceAll('_', ' ')}</Text></Pressable>)}<Pressable onPress={back} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Cancel</Text></Pressable></View>
      ) : null}
      {view === 'block' ? (
        <View><Text style={styles.infoTitle}>Block this person?</Text><Text style={styles.sheetCopy}>They will no longer be able to contact or discover you. You will leave this Private Spark immediately.</Text><Pressable disabled={busy} onPress={onBlock} style={styles.dangerAction}><Text style={styles.dangerActionText}>{busy ? 'Blocking…' : 'Block and leave'}</Text></Pressable><Pressable onPress={back} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Cancel</Text></Pressable></View>
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  entry: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, alignItems: 'center', justifyContent: 'center' },
  entryCard: { width: 238, paddingHorizontal: 22, paddingVertical: 23, borderRadius: 28, alignItems: 'center', backgroundColor: '#071512E8', borderColor: '#A994D84D' },
  heartMark: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8B73D627', borderWidth: 1, borderColor: '#B8A2E653' },
  entryEyebrow: { marginTop: 12, color: '#CCB9EE', fontSize: 9, letterSpacing: 2, fontFamily: 'Manrope_800ExtraBold' },
  entryTitle: { marginTop: 7, color: '#FFF7EC', fontSize: 19, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold' },
  entryCopy: { marginTop: 6, color: '#9DB1AB', fontSize: 10, fontFamily: 'Manrope_500Medium' },
  toast: { alignSelf: 'center', minHeight: 38, paddingHorizontal: 14, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#151D1BE8', borderColor: '#B9A4E849' },
  toastText: { color: '#F6EDDF', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  backdrop: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: '#02080799' },
  sheet: { padding: 20, paddingBottom: 24, borderRadius: 28, backgroundColor: '#0A1B18F7', borderWidth: 1, borderColor: '#FFFFFF22' },
  sheetEyebrow: { color: '#C9B5EC', fontSize: 9, letterSpacing: 1.8, fontFamily: 'Manrope_800ExtraBold' },
  sheetTitle: { marginTop: 7, color: '#FFF7EC', fontSize: 23, fontFamily: 'PlayfairDisplay_700Bold' },
  sheetTitleInline: { flex: 1, marginTop: 0, fontSize: 18 },
  sheetCopy: { marginTop: 8, color: '#A5B7B1', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  primaryAction: { marginTop: 20, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#BFDCCF' },
  primaryActionText: { color: '#09201B', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  dangerAction: { marginTop: 10, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5D3032' },
  dangerActionText: { color: '#F8DEDB', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  sheetHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetHeadingCopy: { flex: 1 },
  sparkIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8B73D62D' },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF0E' },
  promptContext: { marginTop: 3, color: '#9EB4AD', fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  promptQuestion: { marginTop: 22, color: '#FFF7EC', fontSize: 21, lineHeight: 29, fontFamily: 'PlayfairDisplay_700Bold' },
  inlineActions: { marginTop: 22, flexDirection: 'row', gap: 10 },
  secondaryAction: { flex: 1, minHeight: 46, marginTop: 12, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF24' },
  secondaryActionText: { color: '#E9E0D2', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  primaryInline: { flex: 1, minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#BFDCCF' },
  menuList: { marginTop: 14, gap: 6 },
  menuItem: { minHeight: 48, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center', backgroundColor: '#FFFFFF0A' },
  menuText: { color: '#F4EBDD', fontSize: 13, textTransform: 'capitalize', fontFamily: 'Manrope_700Bold' },
  leaveItem: { minHeight: 48, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center', backgroundColor: '#5D303233' },
  leaveText: { color: '#F0BFC0', fontSize: 13, fontFamily: 'Manrope_700Bold' },
  infoTitle: { marginTop: 18, color: '#FFF7EC', fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
});
