import { Image } from 'expo-image';
import { Heart, MessageCircle, ShieldCheck, X } from 'lucide-react-native';
import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LiveMemberPreview } from '../application/index.ts';
import { LiveGlassSurface } from './LiveGlassSurface.tsx';

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
            <X color="#FFF7EC" size={19} />
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
            <ShieldCheck color="#D7B56D" size={13} />
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
                <MessageCircle color="#102522" size={18} />
                <Text style={styles.requestText}>Request</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={isLiked ? `${name} liked` : `Like ${name}`}
                accessibilityRole="button"
                disabled={busy || isLiked}
                onPress={onLike}
                style={[styles.action, styles.likeAction, (busy || isLiked) && styles.disabled]}
              >
                <Heart color={isLiked ? '#F6C3CB' : '#FFF7EC'} fill={isLiked ? '#F6C3CB' : 'transparent'} size={18} />
                <Text style={styles.likeText}>{isLiked ? 'Liked' : 'Like'}</Text>
              </Pressable>
            </View>
          )}
        </LiveGlassSurface>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', padding: 18, paddingBottom: 34, backgroundColor: '#020806B8' },
  card: { borderRadius: 30, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 20, alignItems: 'center', backgroundColor: '#0B201DDD' },
  close: { position: 'absolute', zIndex: 2, right: 14, top: 14, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF0D', borderWidth: 1, borderColor: '#FFFFFF18' },
  avatarShell: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17322D', borderWidth: 1.5, borderColor: '#D7B56DAA' },
  avatar: { width: 98, height: 98, borderRadius: 49 },
  initials: { color: '#F7E8C7', fontSize: 28, fontFamily: 'Manrope_800ExtraBold' },
  name: { maxWidth: '85%', marginTop: 16, color: '#FFF7EC', fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  rolePill: { marginTop: 9, height: 29, paddingHorizontal: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D7B56D13', borderWidth: 1, borderColor: '#D7B56D55' },
  role: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  context: { marginTop: 16, color: '#D6E2DE', fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  privacy: { marginTop: 6, color: '#81938E', fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  actions: { width: '100%', marginTop: 22, flexDirection: 'row', gap: 10 },
  action: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  requestAction: { backgroundColor: '#D7B56D' },
  likeAction: { backgroundColor: '#713A40', borderWidth: 1, borderColor: '#B46A7288' },
  requestText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  likeText: { color: '#FFF7EC', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.58 },
  fullButton: { width: '100%', height: 50, marginTop: 22, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  fullButtonText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
});
