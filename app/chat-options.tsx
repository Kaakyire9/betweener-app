import {
  queueChatOptionsFeedback,
  publishChatOptionsPrefsPreview,
  queueChatOptionsAction,
  type ChatOptionsAction,
} from '@/lib/chat-options-bus';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Motion } from '@/lib/motion';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef } from 'react';

type ActionItem = {
  key: ChatOptionsAction;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  badgeLabel?: string | null;
  destructive?: boolean;
};

const CHAT_PREFS_STORAGE_KEY = 'chat_header_prefs_v1';

export default function ChatOptionsScreen() {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const targetId = typeof params.id === 'string' ? params.id : '';
  const peerUserId = typeof params.peerUserId === 'string' ? params.peerUserId : '';
  const peerProfileId = typeof params.peerProfileId === 'string' ? params.peerProfileId : '';
  const userName = typeof params.userName === 'string' ? params.userName : 'Conversation';
  const peerHasLeftBetweener = params.peerHasLeftBetweener === 'true';
  const canPlanDate = params.canPlanDate === 'true';
  const isChatMuted = params.isChatMuted === 'true';
  const isChatPinned = params.isChatPinned === 'true';
  const isBlockedByMe = params.isBlockedByMe === 'true';
  const headerStatusLabel =
    typeof params.headerStatusLabel === 'string' ? params.headerStatusLabel : 'Conversation active';
  const conversationSignal =
    typeof params.conversationSignal === 'string' && params.conversationSignal.trim().length > 0
      ? params.conversationSignal
      : '';
  const datePlanUnlockReason =
    typeof params.datePlanUnlockReason === 'string'
      ? params.datePlanUnlockReason
      : 'Keep warming the connection first, then plan the date from chat.';
  const summaryOpacity = useRef(new Animated.Value(0)).current;
  const summaryTranslateY = useRef(new Animated.Value(Motion.transform.enterTranslateY)).current;
  const sectionOpacities = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const sectionTranslateYs = useRef([
    new Animated.Value(Motion.transform.enterTranslateY + 2),
    new Animated.Value(Motion.transform.enterTranslateY + 6),
    new Animated.Value(Motion.transform.enterTranslateY + 10),
  ]).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(summaryOpacity, {
        toValue: 1,
        duration: Motion.duration.slow,
        easing: Motion.easing.outCubic,
        useNativeDriver: true,
      }),
      Animated.timing(summaryTranslateY, {
        toValue: 0,
        duration: Motion.duration.slow,
        easing: Motion.easing.outCubic,
        useNativeDriver: true,
      }),
    ]).start();

    sectionOpacities.forEach((opacity, index) => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: Motion.duration.base,
          delay: 70 + index * 60,
          easing: Motion.easing.outCubic,
          useNativeDriver: true,
        }),
        Animated.timing(sectionTranslateYs[index], {
          toValue: 0,
          duration: Motion.duration.base,
          delay: 70 + index * 60,
          easing: Motion.easing.outCubic,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [sectionOpacities, sectionTranslateYs, summaryOpacity, summaryTranslateY]);

  const handleAction = (action: ChatOptionsAction) => {
    if (action === 'view-profile' && peerProfileId) {
      router.replace({
        pathname: '/profile-view',
        params: { profileId: peerProfileId },
      });
      return;
    }
    if (!targetId) {
      router.back();
      return;
    }
    if (action === 'toggle-mute') {
      const nextMuted = !isChatMuted;
      const nextPinned = isChatPinned;
      publishChatOptionsPrefsPreview(targetId, { muted: nextMuted, pinned: nextPinned });
      queueChatOptionsFeedback(targetId, {
        label: nextMuted ? 'Chat muted' : 'Chat unmuted',
        icon: nextMuted ? 'volume-off' : 'volume-high',
      });
      void (async () => {
        try {
          const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          const nextSnapshot = { muted: nextMuted, pinned: nextPinned };
          parsed[targetId] = nextSnapshot;
          if (peerUserId && peerUserId !== targetId) {
            parsed[peerUserId] = nextSnapshot;
          }
          await AsyncStorage.setItem(CHAT_PREFS_STORAGE_KEY, JSON.stringify(parsed));
        } catch {
          // Ignore local persistence errors.
        }
        if (user?.id && peerUserId) {
          const { error } = await supabase
            .from('chat_prefs')
            .upsert(
              {
                user_id: user.id,
                peer_id: peerUserId,
                muted: nextMuted,
                pinned: nextPinned,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,peer_id' },
            );
          if (error) {
            console.log('[chat-options] mute prefs upsert error', error);
          }
        }
      })();
      router.back();
      return;
    }
    if (action === 'toggle-pin') {
      const nextPinned = !isChatPinned;
      const nextMuted = isChatMuted;
      publishChatOptionsPrefsPreview(targetId, { muted: nextMuted, pinned: nextPinned });
      queueChatOptionsFeedback(targetId, {
        label: nextPinned ? 'Chat pinned' : 'Chat unpinned',
        icon: nextPinned ? 'pin' : 'pin-off-outline',
      });
      void (async () => {
        try {
          const raw = await AsyncStorage.getItem(CHAT_PREFS_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          const nextSnapshot = { muted: nextMuted, pinned: nextPinned };
          parsed[targetId] = nextSnapshot;
          if (peerUserId && peerUserId !== targetId) {
            parsed[peerUserId] = nextSnapshot;
          }
          await AsyncStorage.setItem(CHAT_PREFS_STORAGE_KEY, JSON.stringify(parsed));
        } catch {
          // Ignore local persistence errors.
        }
        if (user?.id && peerUserId) {
          const { error } = await supabase
            .from('chat_prefs')
            .upsert(
              {
                user_id: user.id,
                peer_id: peerUserId,
                muted: nextMuted,
                pinned: nextPinned,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,peer_id' },
            );
          if (error) {
            console.log('[chat-options] pin prefs upsert error', error);
          }
        }
      })();
      router.back();
      return;
    }
    queueChatOptionsAction(targetId, {
      type: action,
      force: action === 'suggest-date' ? canPlanDate : undefined,
    });
    router.back();
  };

  const quickItems: ActionItem[] = [];
  if (!peerHasLeftBetweener) {
    quickItems.push({
      key: 'view-profile',
      title: 'View profile',
      description: 'Open trust, photos, and details.',
      icon: 'account-outline',
    });
  }
  quickItems.push(
    { key: 'search-chat', title: 'Search in chat', description: 'Find a message in this thread.', icon: 'magnify' },
    { key: 'media-hub', title: 'Media, links & docs', description: 'Browse shared attachments.', icon: 'image-multiple-outline' },
  );
  if (!peerHasLeftBetweener) {
    quickItems.push({
      key: 'suggest-date',
      title: 'Suggest a date',
      description: canPlanDate ? 'Open the planner and shape a real plan.' : datePlanUnlockReason,
      icon: 'calendar-heart',
      badgeLabel: canPlanDate ? 'Ready now' : 'Warm up first',
    });
  }

  const controlItems: ActionItem[] = [
    {
      key: 'toggle-mute',
      title: isChatMuted ? 'Unmute chat' : 'Mute chat',
      description: isChatMuted ? 'Notifications are silenced.' : 'Silence notifications for this chat.',
      icon: isChatMuted ? 'volume-high' : 'volume-off',
      badgeLabel: isChatMuted ? 'On' : null,
    },
    {
      key: 'toggle-pin',
      title: isChatPinned ? 'Unpin chat' : 'Pin chat',
      description: isChatPinned ? 'Remove from priority chats.' : 'Keep this chat easy to find.',
      icon: isChatPinned ? 'pin-off-outline' : 'pin-outline',
      badgeLabel: isChatPinned ? 'Pinned' : null,
    },
  ];

  const safetyItems: ActionItem[] = [
    {
      key: 'clear-chat',
      title: 'Clear chat',
      description: 'Remove this thread from your device.',
      icon: 'trash-can-outline',
      destructive: true,
    },
    {
      key: 'toggle-block',
      title: isBlockedByMe ? 'Unblock user' : 'Block user',
      description: isBlockedByMe ? 'Allow messages again.' : 'They will not be notified.',
      icon: 'block-helper',
      badgeLabel: isBlockedByMe ? 'Blocked' : null,
      destructive: true,
    },
    {
      key: 'report-user',
      title: 'Report user',
      description: 'Send a private safety report.',
      icon: 'alert-octagon-outline',
      destructive: true,
    },
  ];

  const sections = [
    { key: 'quick', label: 'Quick', items: quickItems },
    { key: 'controls', label: 'Controls', items: controlItems },
    { key: 'safety', label: 'Safety', items: safetyItems },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ['rgba(64,219,226,0.08)', 'rgba(139,92,255,0.06)', 'rgba(15,26,26,1)']
            : ['rgba(64,219,226,0.08)', 'rgba(139,92,255,0.05)', theme.background]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(10,20,20,0.08)' }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.text }]}>Chat options</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
            {userName}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            styles.closeButton,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,20,20,0.05)',
              borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(10,20,20,0.08)',
            },
          ]}
        >
          <MaterialCommunityIcons name="close" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(20, insets.bottom + 18) }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: summaryOpacity,
            transform: [{ translateY: summaryTranslateY }],
          }}
        >
          <BlurViewSafe
            intensity={34}
            tint={isDark ? 'dark' : 'light'}
            style={[
              styles.summaryCard,
              { borderColor: isDark ? 'rgba(64,219,226,0.24)' : 'rgba(64,219,226,0.16)' },
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={
                isDark
                  ? ['rgba(64,219,226,0.16)', 'rgba(64,219,226,0.06)', 'rgba(0,0,0,0)']
                  : ['rgba(64,219,226,0.12)', 'rgba(64,219,226,0.04)', 'rgba(255,255,255,0.2)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.summaryHeaderRow}>
              <View
                style={[
                  styles.summaryStatusDot,
                  {
                    backgroundColor: peerHasLeftBetweener
                      ? '#f97316'
                      : headerStatusLabel === 'Active now'
                        ? '#34d399'
                        : isChatMuted
                          ? '#f59e0b'
                          : '#40dbe2',
                  },
                ]}
              />
              <Text style={[styles.summaryStatusLabel, { color: theme.text }]}>{headerStatusLabel}</Text>
            </View>
            <Text style={[styles.summaryTitle, { color: theme.text }]}>
              {canPlanDate ? 'This connection is date-ready.' : 'Build a little more momentum first.'}
            </Text>
            <Text style={[styles.summaryBody, { color: theme.textMuted }]}>
              {canPlanDate
                ? 'Search messages, browse shared moments, or turn the energy into a real plan.'
                : datePlanUnlockReason}
            </Text>
            <View style={styles.summaryPills}>
              {conversationSignal ? (
                <View
                  style={[
                    styles.summaryPill,
                    {
                      backgroundColor: isDark ? 'rgba(64,219,226,0.16)' : 'rgba(64,219,226,0.09)',
                      borderColor: isDark ? 'rgba(64,219,226,0.28)' : 'rgba(64,219,226,0.16)',
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="cards-heart-outline" size={14} color={theme.tint} />
                  <Text style={[styles.summaryPillText, { color: theme.text }]}>{conversationSignal}</Text>
                </View>
              ) : null}
              {isChatMuted ? (
                <View
                  style={[
                    styles.summaryPill,
                    {
                      backgroundColor: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.08)',
                      borderColor: isDark ? 'rgba(245,158,11,0.24)' : 'rgba(245,158,11,0.16)',
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="volume-off" size={14} color="#f59e0b" />
                  <Text style={[styles.summaryPillText, { color: theme.text }]}>Muted</Text>
                </View>
              ) : null}
              {isChatPinned ? (
                <View
                  style={[
                    styles.summaryPill,
                    {
                      backgroundColor: isDark ? 'rgba(96,165,250,0.16)' : 'rgba(96,165,250,0.08)',
                      borderColor: isDark ? 'rgba(96,165,250,0.24)' : 'rgba(96,165,250,0.16)',
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="pin-outline" size={14} color="#60a5fa" />
                  <Text style={[styles.summaryPillText, { color: theme.text }]}>Pinned</Text>
                </View>
              ) : null}
            </View>
          </BlurViewSafe>
        </Animated.View>
        {sections.map((section, sectionIndex) => (
          <Animated.View
            key={section.key}
            style={[
              styles.section,
              {
                opacity: sectionOpacities[sectionIndex],
                transform: [{ translateY: sectionTranslateYs[sectionIndex] }],
              },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{section.label}</Text>
            <View style={styles.actionGrid}>
              {section.items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => handleAction(item.key)}
                  style={({ pressed }) => [
                    styles.actionPressable,
                    pressed && styles.actionPressablePressed,
                  ]}
                >
                  <BlurViewSafe
                    intensity={28}
                    tint={isDark ? 'dark' : 'light'}
                    style={[
                      styles.actionButton,
                      item.destructive
                        ? {
                            backgroundColor: isDark ? 'rgba(239,68,68,0.11)' : 'rgba(255,255,255,0.3)',
                            borderColor: isDark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.18)',
                          }
                        : {
                            backgroundColor:
                              item.key === 'suggest-date' && canPlanDate
                                ? isDark
                                  ? 'rgba(64,219,226,0.18)'
                                  : 'rgba(255,255,255,0.34)'
                                : isDark
                                  ? 'rgba(255,255,255,0.05)'
                                  : 'rgba(255,255,255,0.28)',
                            borderColor:
                              item.key === 'suggest-date' && canPlanDate
                                ? isDark
                                  ? 'rgba(64,219,226,0.36)'
                                  : 'rgba(64,219,226,0.22)'
                                : isDark
                                  ? 'rgba(64,219,226,0.24)'
                                  : 'rgba(64,219,226,0.14)',
                          },
                    ]}
                  >
                    <View style={styles.actionRow}>
                      <View
                        style={[
                          styles.actionIconWrap,
                          item.destructive
                            ? {
                                backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)',
                                borderColor: isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.18)',
                              }
                            : {
                                backgroundColor: isDark ? 'rgba(64,219,226,0.18)' : 'rgba(64,219,226,0.11)',
                                borderColor: isDark ? 'rgba(64,219,226,0.26)' : 'rgba(64,219,226,0.16)',
                              },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={item.icon}
                          size={18}
                          color={item.destructive ? (isDark ? '#fecaca' : '#b91c1c') : theme.tint}
                        />
                      </View>
                      <View style={styles.actionCopy}>
                        <Text
                          style={[
                            styles.actionTitle,
                            { color: item.destructive ? (isDark ? '#fecaca' : '#b91c1c') : theme.text },
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text style={[styles.actionDescription, { color: theme.textMuted }]}>
                          {item.description}
                        </Text>
                      </View>
                      <View style={styles.actionMeta}>
                        {item.badgeLabel ? (
                          <View
                            style={[
                              styles.actionBadge,
                              item.destructive
                                ? {
                                    backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.08)',
                                    borderColor: isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.16)',
                                  }
                                : {
                                    backgroundColor: isDark ? 'rgba(64,219,226,0.18)' : 'rgba(64,219,226,0.12)',
                                    borderColor: isDark ? 'rgba(64,219,226,0.32)' : 'rgba(64,219,226,0.2)',
                                  },
                            ]}
                          >
                            <Text
                              style={[
                                styles.actionBadgeText,
                                { color: item.destructive ? (isDark ? '#fecaca' : '#b91c1c') : theme.text },
                              ]}
                            >
                              {item.badgeLabel}
                            </Text>
                          </View>
                        ) : null}
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color={isDark ? 'rgba(255,255,255,0.5)' : 'rgba(10,20,20,0.42)'}
                        />
                      </View>
                    </View>
                  </BlurViewSafe>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
    paddingBottom: 8,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  scroller: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  summaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 18,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryStatusLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
  },
  summaryTitle: {
    marginTop: 12,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Manrope_700Bold',
  },
  summaryBody: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
  },
  summaryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  summaryPillText: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
  },
  section: {
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingTop: 6,
    paddingBottom: 8,
  },
  actionGrid: {
    gap: 8,
  },
  actionPressable: {
    transform: [{ scale: 1 }],
  },
  actionPressablePressed: {
    transform: [{ scale: Motion.transform.pressScale }],
    opacity: Motion.transform.pressOpacity,
  },
  actionButton: {
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionCopy: {
    flex: 1,
    gap: 3,
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  actionDescription: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Manrope_500Medium',
  },
  actionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
  },
});
