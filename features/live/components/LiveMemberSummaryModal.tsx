import { Image } from 'expo-image';
import { Heart, MessageCircle, ShieldCheck, X } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LiveMemberPreview } from '../application/index.ts';
import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  busy?: boolean;
  isLiked?: boolean;
  isSelf?: boolean;
  member: LiveMemberPreview | null;
  onClose: () => void;
  onLike: () => void;
  onRequest: () => void;
  roomTitle: string;
  visible: boolean;
};

const initials = (name: string | null | undefined) => {
  const value = name?.trim();
  if (!value) return 'B';
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
};

export const LiveMemberSummaryModal = memo(function LiveMemberSummaryModal({
  busy = false,
  isLiked = false,
  isSelf = false,
  member,
  onClose,
  onLike,
  onRequest,
  roomTitle,
  visible,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const name = member?.fullName?.trim() || 'Betweener member';
  const role = member?.role === 'host'
    ? 'HOST'
    : member?.role === 'moderator' || member?.role === 'internal_admin'
      ? 'MODERATOR'
      : 'IN THE ROOM';

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible && member !== null}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close member summary" onPress={onClose} style={StyleSheet.absoluteFill} />
        <LiveGlassSurface intensity={62} style={styles.card}>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.close}>
            <X color={visual.color.text} size={19} />
          </Pressable>

          <View style={styles.avatarShell}>
            {member?.avatarUrl ? (
              <Image contentFit="cover" source={{ uri: member.avatarUrl }} style={styles.avatar} transition={140} />
            ) : (
              <Text style={styles.initials}>{initials(name)}</Text>
            )}
          </View>
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
          <View style={styles.rolePill}>
            <ShieldCheck color={visual.color.teal} size={13} />
            <Text style={styles.role}>{role}</Text>
          </View>
          <Text style={styles.context}>Sharing this moment in {roomTitle}</Text>
          <Text style={styles.privacy}>Actions are private. Nothing is announced to the room.</Text>

          {isSelf ? (
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.fullButton}>
              <Text style={styles.fullButtonText}>Close</Text>
            </Pressable>
          ) : (
            <View style={styles.actions}>
              <Pressable
                accessibilityLabel={`Request to connect with ${name}`}
                accessibilityRole="button"
                disabled={busy}
                onPress={onRequest}
                style={[styles.action, styles.requestAction, busy && styles.disabled]}
              >
                <MessageCircle color={visual.color.accentContrast} size={18} />
                <Text style={styles.requestText}>Request</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={isLiked ? `${name} liked` : `Like ${name}`}
                accessibilityRole="button"
                disabled={busy || isLiked}
                onPress={onLike}
                style={[styles.action, styles.likeAction, (busy || isLiked) && styles.disabled]}
              >
                <Heart color={isLiked ? visual.color.danger : visual.color.dangerText} fill={isLiked ? visual.color.danger : 'transparent'} size={18} />
                <Text style={styles.likeText}>{isLiked ? 'Liked' : 'Like'}</Text>
              </Pressable>
            </View>
          )}
        </LiveGlassSurface>
      </View>
    </Modal>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', padding: 18, paddingBottom: 34, backgroundColor: visual.color.scrim },
  card: { borderRadius: 30, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 20, alignItems: 'center', backgroundColor: visual.color.surfaceTranslucent },
  close: { position: 'absolute', zIndex: 2, right: 14, top: 14, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  avatarShell: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.tealSoft, borderWidth: 1.5, borderColor: visual.color.borderStrong },
  avatar: { width: 98, height: 98, borderRadius: 49 },
  initials: { color: visual.color.text, fontSize: 28, fontFamily: 'Manrope_800ExtraBold' },
  name: { maxWidth: '85%', marginTop: 16, color: visual.color.text, fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  rolePill: { marginTop: 9, height: 29, paddingHorizontal: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: visual.color.tealSoft, borderWidth: 1, borderColor: visual.color.borderStrong },
  role: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  context: { marginTop: 16, color: visual.color.text, fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  privacy: { marginTop: 6, color: visual.color.textMuted, fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  actions: { width: '100%', marginTop: 22, flexDirection: 'row', gap: 10 },
  action: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  requestAction: { backgroundColor: visual.color.teal },
  likeAction: { backgroundColor: visual.color.dangerSoft, borderWidth: 1, borderColor: visual.color.danger },
  requestText: { color: visual.color.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  likeText: { color: visual.color.dangerText, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.58 },
  fullButton: { width: '100%', height: 50, marginTop: 22, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal },
  fullButtonText: { color: visual.color.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
});
