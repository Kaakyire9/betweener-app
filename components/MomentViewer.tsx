import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Moment, MomentUser } from '@/hooks/useMoments';
import { createSignedUrl } from '@/lib/moments';
import MomentCommentsModal from '@/components/MomentCommentsModal';

const DEFAULT_MOMENT_DURATION = 6000;
const VIDEO_MOMENT_DURATION = 15000;

const emoji = (...codes: number[]) => String.fromCodePoint(...codes);
const REACTIONS = [emoji(0x2764, 0xfe0f), emoji(0x1f525), emoji(0x1f60d), emoji(0x1f44f)];

const MomentVideo = ({ uri, shouldPlay }: { uri: string; shouldPlay: boolean }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    if (shouldPlay) {
      try { p.play(); } catch {}
    }
  });

  useEffect(() => {
    if (shouldPlay) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [player, shouldPlay]);

  return <VideoView style={styles.media} player={player} contentFit="cover" nativeControls={false} />;
};

type Props = {
  visible: boolean;
  users: MomentUser[];
  startUserId?: string | null;
  startMomentId?: string | null;
  onClose: () => void;
};

const formatTimeLeft = (expiresAt: string) => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  return `${hours}h left`;
};

export default function MomentViewer({ visible, users, startUserId, startMomentId, onClose }: Props) {
  const { user } = useAuth();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [activeUserIndex, setActiveUserIndex] = useState(0);
  const [activeMomentIndex, setActiveMomentIndex] = useState(0);
  const initializedRef = useRef(false);
  const usersRef = useRef(users);
  const activeUserIndexRef = useRef(activeUserIndex);
  const activeMomentIndexRef = useRef(activeMomentIndex);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [commentCount, setCommentCount] = useState(0);
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);

  const currentUser = users[activeUserIndex];
  const currentMoment = currentUser?.moments?.[activeMomentIndex];

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const ensureSignedUrls = useCallback(async (moments: Moment[]) => {
    const missing = moments.filter((m) => m.media_url && !m.media_url.startsWith('http') && !signedUrls[m.id]);
    if (missing.length === 0) return;
    const resolved: Record<string, string> = {};
    await Promise.all(
      missing.map(async (m) => {
        const url = await createSignedUrl(m.media_url || '', 3600);
        if (url) resolved[m.id] = url;
      }),
    );
    if (Object.keys(resolved).length > 0) {
      setSignedUrls((prev) => ({ ...prev, ...resolved }));
    }
  }, [signedUrls]);

  const fetchReactions = useCallback(async (momentId: string) => {
    if (!momentId) return;
    const { data, error } = await supabase.from('moment_reactions').select('emoji,user_id').eq('moment_id', momentId);
    if (error || !data) {
      setReactionCounts({});
      setUserReaction(null);
      return;
    }
    const counts: Record<string, number> = {};
    let mine: string | null = null;
    data.forEach((row: any) => {
      counts[row.emoji] = (counts[row.emoji] || 0) + 1;
      if (row.user_id === user?.id) mine = row.emoji;
    });
    setReactionCounts(counts);
    setUserReaction(mine);
  }, [user?.id]);

  const fetchCommentCount = useCallback(async (momentId: string) => {
    if (!momentId) return;
    const { count, error } = await supabase
      .from('moment_comments')
      .select('id', { count: 'exact', head: true })
      .eq('moment_id', momentId)
      .eq('is_deleted', false);
    if (error) {
      setCommentCount(0);
      return;
    }
    setCommentCount(count ?? 0);
  }, []);

  const handleNext = useCallback(() => {
    const usersList = usersRef.current;
    const userIndex = activeUserIndexRef.current;
    const momentIndex = activeMomentIndexRef.current;
    const userEntry = usersList[userIndex];
    if (!userEntry) {
      onClose();
      return;
    }
    if (momentIndex < userEntry.moments.length - 1) {
      setActiveMomentIndex(momentIndex + 1);
      return;
    }
    if (userIndex < usersList.length - 1) {
      setActiveUserIndex(userIndex + 1);
      setActiveMomentIndex(0);
      return;
    }
    onClose();
  }, [onClose]);

  const handlePrev = useCallback(() => {
    const usersList = usersRef.current;
    const userIndex = activeUserIndexRef.current;
    const momentIndex = activeMomentIndexRef.current;
    const userEntry = usersList[userIndex];
    if (!userEntry) {
      onClose();
      return;
    }
    if (momentIndex > 0) {
      setActiveMomentIndex(momentIndex - 1);
      return;
    }
    if (userIndex > 0) {
      const prevUser = usersList[userIndex - 1];
      setActiveUserIndex(userIndex - 1);
      setActiveMomentIndex(prevUser ? Math.max(0, prevUser.moments.length - 1) : 0);
      return;
    }
    onClose();
  }, [onClose]);

  const startProgress = useCallback((duration: number) => {
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !commentsVisible) {
        handleNext();
      }
    });
  }, [commentsVisible, handleNext, progressAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dy) < 30,
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dy) < 30,
      onPanResponderRelease: (evt, gesture) => {
        if (gesture.dx < -30) {
          handleNext();
          return;
        }
        if (gesture.dx > 30) {
          handlePrev();
          return;
        }
        if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
          const x = evt.nativeEvent.locationX;
          if (x <= screenWidth * 0.45) {
            handlePrev();
          } else if (x >= screenWidth * 0.55) {
            handleNext();
          }
        }
      },
    }),
  ).current;

  const handleReact = async (emojiValue: string) => {
    if (!currentMoment || !user?.id) return;
    const prevReaction = userReaction;
    const { error } = await supabase
      .from('moment_reactions')
      .upsert({ moment_id: currentMoment.id, user_id: user.id, emoji: emojiValue }, { onConflict: 'moment_id,user_id' });
    if (error) return;
    setUserReaction(emojiValue);
    setReactionCounts((prev) => {
      const next = { ...prev };
      if (prevReaction && prevReaction !== emojiValue) {
        next[prevReaction] = Math.max(0, (next[prevReaction] || 1) - 1);
      }
      next[emojiValue] = (next[emojiValue] || 0) + (prevReaction === emojiValue ? 0 : 1);
      return next;
    });
  };

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    activeUserIndexRef.current = activeUserIndex;
  }, [activeUserIndex]);

  useEffect(() => {
    activeMomentIndexRef.current = activeMomentIndex;
  }, [activeMomentIndex]);

  useEffect(() => {
    if (!visible) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    if (users.length === 0) return;
    initializedRef.current = true;
    const idx = startUserId ? users.findIndex((u) => u.userId === startUserId) : 0;
    const safeUserIndex = idx >= 0 ? idx : 0;
    const targetUser = users[safeUserIndex];
    let momentIndex = 0;
    if (startMomentId && targetUser?.moments?.length) {
      const foundIndex = targetUser.moments.findIndex((m) => m.id === startMomentId);
      if (foundIndex >= 0) momentIndex = foundIndex;
    }
    setActiveUserIndex(safeUserIndex);
    setActiveMomentIndex(momentIndex);
    setReactionCounts({});
    setUserReaction(null);
  }, [visible, startMomentId, startUserId, users]);

  useEffect(() => {
    if (visible && users.length === 0) {
      onClose();
    }
  }, [onClose, users.length, visible]);

  useEffect(() => {
    if (!visible || users.length === 0) return;
    const userEntry = users[activeUserIndex];
    if (!userEntry || userEntry.moments.length === 0) {
      const nextUserIndex = users.findIndex((u, idx) => idx >= activeUserIndex && u.moments.length > 0);
      if (nextUserIndex >= 0) {
        setActiveUserIndex(nextUserIndex);
        setActiveMomentIndex(0);
        return;
      }
      onClose();
      return;
    }
    if (activeMomentIndex >= userEntry.moments.length) {
      setActiveMomentIndex(Math.max(0, userEntry.moments.length - 1));
    }
  }, [activeMomentIndex, activeUserIndex, onClose, users, visible]);

  useEffect(() => {
    if (!visible) {
      setCommentsVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    setCommentsVisible(false);
  }, [currentMoment?.id]);

  useEffect(() => {
    if (!visible || !currentUser) return;
    void ensureSignedUrls(currentUser.moments);
  }, [visible, currentUser, ensureSignedUrls]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    void fetchReactions(currentMoment.id);
  }, [currentMoment, fetchReactions, visible]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    void fetchCommentCount(currentMoment.id);
  }, [currentMoment, fetchCommentCount, visible]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    const channel = supabase
      .channel(`moment-comments-count-${currentMoment.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moment_comments', filter: `moment_id=eq.${currentMoment.id}` },
        () => {
          void fetchCommentCount(currentMoment.id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentMoment, fetchCommentCount, visible]);

  useEffect(() => {
    if (!visible || !currentMoment || commentsVisible) return;
    const duration = currentMoment.type === 'video' ? VIDEO_MOMENT_DURATION : DEFAULT_MOMENT_DURATION;
    startProgress(duration);
  }, [commentsVisible, currentMoment, startProgress, visible]);

  useEffect(() => {
    if (commentsVisible) {
      progressAnim.stopAnimation();
    }
  }, [commentsVisible, progressAnim]);

  const mediaUrl = useMemo(() => {
    if (!currentMoment?.media_url) return null;
    if (currentMoment.media_url.startsWith('http')) return currentMoment.media_url;
    return signedUrls[currentMoment.id] || null;
  }, [currentMoment, signedUrls]);

  if (!visible || !currentUser || !currentMoment) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.progressRow}>
          {currentUser.moments.map((m, idx) => (
            <View key={m.id} style={styles.progressTrack}>
              {idx < activeMomentIndex ? <View style={styles.progressFill} /> : null}
              {idx === activeMomentIndex ? (
                <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.header}>
          <View style={styles.userInfo}>
            {currentUser.avatarUrl ? (
              <Image source={{ uri: currentUser.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{currentUser.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={styles.userName}>{currentUser.name}</Text>
              <Text style={styles.timeLeft}>{formatTimeLeft(currentMoment.expires_at)}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.mediaWrapper}>
          {currentMoment.type === 'text' ? (
            <View style={styles.textMoment}>
              <Text style={styles.textMomentBody}>{currentMoment.text_body || ''}</Text>
              {currentMoment.caption ? <Text style={styles.textCaption}>{currentMoment.caption}</Text> : null}
            </View>
          ) : currentMoment.type === 'photo' ? (
            mediaUrl ? (
              <Image source={{ uri: mediaUrl }} style={styles.media} />
            ) : (
              <View style={styles.mediaFallback} />
            )
          ) : mediaUrl ? (
            <MomentVideo uri={mediaUrl} shouldPlay={!commentsVisible} />
          ) : (
            <View style={styles.mediaFallback} />
          )}
          {currentMoment.caption && currentMoment.type !== 'text' ? (
            <View style={styles.captionBubble}>
              <Text style={styles.captionText}>{currentMoment.caption}</Text>
            </View>
          ) : null}
          <View style={styles.gestureLayer} pointerEvents="box-only" {...panResponder.panHandlers} />
        </View>

        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.bottomGradient} pointerEvents="none" />

        <View style={styles.actions}>
          <View style={styles.reactionColumn}>
            {REACTIONS.map((emojiValue) => {
              const isActive = userReaction === emojiValue;
              const count = reactionCounts[emojiValue] || 0;
              return (
                <Pressable key={emojiValue} onPress={() => handleReact(emojiValue)} style={[styles.reactionButton, isActive && styles.reactionActive]}>
                  <Text style={styles.reactionEmoji}>{emojiValue}</Text>
                  {count > 0 ? <Text style={styles.reactionCount}>{count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.commentButton} onPress={() => setCommentsVisible(true)}>
            <MaterialCommunityIcons name="comment-outline" size={18} color="#fff" />
            {commentCount > 0 ? <Text style={styles.commentCount}>{commentCount}</Text> : null}
          </Pressable>
        </View>
      </View>

      <MomentCommentsModal visible={commentsVisible} momentId={currentMoment.id} onClose={() => setCommentsVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  progressRow: { position: 'absolute', top: 48, left: 12, right: 12, flexDirection: 'row', gap: 6, zIndex: 10 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#fff', borderRadius: 2 },
  header: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontFamily: 'Archivo_700Bold' },
  userName: { color: '#fff', fontFamily: 'Archivo_700Bold', fontSize: 15 },
  timeLeft: { color: '#d1d5db', fontFamily: 'Manrope_500Medium', fontSize: 12, marginTop: 2 },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  mediaWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  media: { width: '100%', height: '100%' },
  mediaFallback: { width: '100%', height: '100%', backgroundColor: '#0b1220' },
  textMoment: {
    width: '84%',
    padding: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textMomentBody: { color: '#f9fafb', fontFamily: 'Manrope_600SemiBold', fontSize: 18, lineHeight: 26 },
  textCaption: { color: '#9ca3af', fontFamily: 'Manrope_500Medium', marginTop: 12 },
  captionBubble: {
    position: 'absolute',
    bottom: 120,
    left: 18,
    right: 18,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  captionText: { color: '#fff', fontFamily: 'Manrope_500Medium', fontSize: 14 },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  actions: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: [{ translateY: -60 }],
    alignItems: 'center',
    gap: 14,
  },
  reactionColumn: { gap: 12, alignItems: 'center' },
  reactionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  reactionActive: { backgroundColor: 'rgba(236,72,153,0.35)' },
  reactionEmoji: { fontSize: 18 },
  reactionCount: { color: '#fff', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  commentButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center',
  },
  commentCount: { color: '#fff', fontSize: 11, fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
  gestureLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
const { width: screenWidth } = Dimensions.get('window');
