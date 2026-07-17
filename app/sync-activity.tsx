import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOfflineSyncStatus } from '@/hooks/useOfflineSyncStatus';
import {
  readOfflineSyncHistory,
  type OfflineSyncHistoryEntry,
} from '@/lib/offline/offline-sync-history';
import {
  describeOfflineSyncMutation,
  getOfflineSyncScopeLabel,
  type OfflineSyncScope,
} from '@/lib/offline/offline-sync-presenter';
import {
  getOfflineMutationQueueSnapshot,
  retryFailedOfflineMutation,
  subscribeToOfflineMutationQueue,
  type FailedOfflineMutation,
  type OfflineMutation,
} from '@/lib/offline/mutation-queue';

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const formatTimeAgo = (timestamp: number) => {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const groupLabelForScope = (scope: OfflineSyncScope) => getOfflineSyncScopeLabel(scope);

export default function SyncActivityScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { pendingCount, failedCount, retryNow } = useOfflineSyncStatus();

  const [pending, setPending] = useState<OfflineMutation[]>([]);
  const [failed, setFailed] = useState<FailedOfflineMutation[]>([]);
  const [history, setHistory] = useState<OfflineSyncHistoryEntry[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [snapshot, recentHistory] = await Promise.all([
      getOfflineMutationQueueSnapshot(),
      readOfflineSyncHistory(),
    ]);
    setPending(snapshot.pending);
    setFailed(snapshot.failed);
    setHistory(recentHistory.slice(0, 24));
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeToOfflineMutationQueue(() => {
      void refresh();
    });
  }, [refresh]);

  const pendingGroups = useMemo(() => {
    const groups = new Map<OfflineSyncScope, OfflineMutation[]>();
    pending.forEach((mutation) => {
      const scope = describeOfflineSyncMutation(mutation).scope;
      groups.set(scope, [...(groups.get(scope) ?? []), mutation]);
    });
    return Array.from(groups.entries());
  }, [pending]);

  const failedGroups = useMemo(() => {
    const groups = new Map<OfflineSyncScope, FailedOfflineMutation[]>();
    failed.forEach((mutation) => {
      const scope = describeOfflineSyncMutation(mutation).scope;
      groups.set(scope, [...(groups.get(scope) ?? []), mutation]);
    });
    return Array.from(groups.entries());
  }, [failed]);

  const handleRetryOne = useCallback(
    async (mutationId: string) => {
      setRetryingId(mutationId);
      try {
        await retryFailedOfflineMutation(mutationId);
        await retryNow();
        await refresh();
      } finally {
        setRetryingId(null);
      }
    },
    [refresh, retryNow],
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.tint, isDark ? 0.28 : 0.16), withAlpha(theme.background, 0)]}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.bgGlow}
      />
      <LinearGradient
        colors={[withAlpha(theme.accent, isDark ? 0.22 : 0.14), 'transparent']}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.86, y: 1 }}
        style={styles.bgGlowRight}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={theme.text} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Sync activity</Text>
          <Text style={styles.headerSubtitle}>Current offline work, failures, and recent recoveries.</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(14,160,160,0.22)', 'rgba(19,33,37,0.92)', 'rgba(117,76,148,0.16)']
                : ['rgba(14,160,160,0.16)', 'rgba(247,236,226,0.96)', 'rgba(117,76,148,0.08)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name="cloud-sync-outline" size={14} color={theme.tint} />
              <Text style={styles.heroBadgeText}>Offline control</Text>
            </View>
            <Text style={styles.heroTitle}>Keep local actions trustworthy</Text>
            <Text style={styles.heroSubtitleCopy}>
              Failed items should be explicit. Pending items should stay quiet. Recent recoveries should be visible.
            </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatValue}>{failedCount}</Text>
                <Text style={styles.heroStatLabel}>Need review</Text>
              </View>
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatValue}>{pendingCount}</Text>
                <Text style={styles.heroStatLabel}>Waiting</Text>
              </View>
            </View>
            <Pressable style={styles.heroPrimaryButton} onPress={() => void retryNow().then(refresh)}>
              <MaterialCommunityIcons name="refresh" size={16} color={Colors.light.background} />
              <Text style={styles.heroPrimaryButtonText}>Retry everything ready now</Text>
            </Pressable>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Needs review</Text>
              <Text style={styles.sectionMeta}>{failed.length}</Text>
            </View>
            {failedGroups.length === 0 ? (
              <Text style={styles.emptyText}>No failed offline actions right now.</Text>
            ) : (
              failedGroups.map(([scope, items]) => (
                <View key={`failed-${scope}`} style={styles.groupBlock}>
                  <Text style={styles.groupTitle}>{groupLabelForScope(scope)}</Text>
                  {items.map((mutation) => {
                    const descriptor = describeOfflineSyncMutation(mutation);
                    return (
                      <View key={mutation.id} style={styles.rowCard}>
                        <View style={[styles.rowIconWrap, styles.rowIconFailed]}>
                          <MaterialCommunityIcons name={descriptor.icon as any} size={18} color={theme.danger} />
                        </View>
                        <View style={styles.rowBody}>
                          <View style={styles.rowTopLine}>
                            <Text style={styles.rowTitle}>{descriptor.title}</Text>
                            <Text style={styles.rowTime}>{formatTimeAgo(mutation.failedAt)}</Text>
                          </View>
                          <Text style={styles.rowDetail}>{descriptor.detail}</Text>
                          <Text style={styles.rowError} numberOfLines={2}>
                            {mutation.failureReason}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.rowActionButton}
                          onPress={() => void handleRetryOne(mutation.id)}
                          disabled={retryingId === mutation.id}
                        >
                          <Text style={styles.rowActionText}>
                            {retryingId === mutation.id ? 'Retrying' : 'Retry'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Waiting to sync</Text>
              <Text style={styles.sectionMeta}>{pending.length}</Text>
            </View>
            {pendingGroups.length === 0 ? (
              <Text style={styles.emptyText}>Nothing is waiting in the offline queue.</Text>
            ) : (
              pendingGroups.map(([scope, items]) => (
                <View key={`pending-${scope}`} style={styles.groupBlock}>
                  <Text style={styles.groupTitle}>{groupLabelForScope(scope)}</Text>
                  {items.map((mutation) => {
                    const descriptor = describeOfflineSyncMutation(mutation);
                    return (
                      <View key={mutation.id} style={styles.rowCard}>
                        <View style={[styles.rowIconWrap, styles.rowIconPending]}>
                          <MaterialCommunityIcons name={descriptor.icon as any} size={18} color={theme.tint} />
                        </View>
                        <View style={styles.rowBody}>
                          <View style={styles.rowTopLine}>
                            <Text style={styles.rowTitle}>{descriptor.title}</Text>
                            <Text style={styles.rowTime}>
                              {mutation.nextAttemptAt && mutation.nextAttemptAt > Date.now()
                                ? `retry ${formatTimeAgo(mutation.nextAttemptAt)}`
                                : 'ready'}
                            </Text>
                          </View>
                          <Text style={styles.rowDetail}>{descriptor.detail}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent sync activity</Text>
              <Text style={styles.sectionMeta}>{history.length}</Text>
            </View>
            {history.length === 0 ? (
              <Text style={styles.emptyText}>Recent offline recoveries and failures will show here.</Text>
            ) : (
              history.map((entry) => (
                <View key={entry.id} style={styles.historyRow}>
                  <View
                    style={[
                      styles.historyIconWrap,
                      entry.eventType === 'failed' ? styles.historyIconFailed : styles.historyIconCompleted,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={entry.eventType === 'failed' ? 'alert-circle-outline' : (entry.icon as any)}
                      size={17}
                      color={entry.eventType === 'failed' ? theme.danger : theme.tint}
                    />
                  </View>
                  <View style={styles.historyBody}>
                    <View style={styles.rowTopLine}>
                      <Text style={styles.rowTitle}>{entry.title}</Text>
                      <Text style={styles.rowTime}>{formatTimeAgo(entry.at)}</Text>
                    </View>
                    <Text style={styles.rowDetail}>{entry.detail}</Text>
                    <View style={styles.historyMetaRow}>
                      <View style={styles.historyScopePill}>
                        <Text style={styles.historyScopeText}>{getOfflineSyncScopeLabel(entry.scope)}</Text>
                      </View>
                      <Text
                        style={[
                          styles.historyStateText,
                          entry.eventType === 'failed' ? styles.historyStateFailed : styles.historyStateCompleted,
                        ]}
                      >
                        {entry.eventType === 'failed' ? 'Failed' : 'Synced'}
                      </Text>
                    </View>
                    {entry.eventType === 'failed' && entry.failureReason ? (
                      <Text style={styles.historyFailureText} numberOfLines={2}>
                        {entry.failureReason}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    safeArea: {
      flex: 1,
    },
    bgGlow: {
      position: 'absolute',
      top: -60,
      left: -80,
      width: 320,
      height: 320,
      borderRadius: 320,
    },
    bgGlowRight: {
      position: 'absolute',
      top: 170,
      right: -120,
      width: 260,
      height: 260,
      borderRadius: 260,
    },
    header: {
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 10,
    },
    backButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    backLabel: {
      fontSize: 12,
      color: theme.text,
      fontFamily: 'Manrope_700Bold',
    },
    headerTitle: {
      marginTop: 12,
      fontSize: 30,
      color: theme.text,
      fontFamily: 'PlayfairDisplay_700Bold',
      letterSpacing: 0.4,
    },
    headerSubtitle: {
      marginTop: 6,
      color: theme.textMuted,
      fontSize: 13,
      fontFamily: 'Manrope_500Medium',
    },
    scrollContent: {
      paddingHorizontal: 18,
      paddingBottom: 40,
      gap: 14,
    },
    heroCard: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      overflow: 'hidden',
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, isDark ? 0.22 : 0.56),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.14),
      marginBottom: 12,
    },
    heroBadgeText: {
      color: theme.text,
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heroTitle: {
      color: theme.text,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: 'PlayfairDisplay_700Bold',
      marginBottom: 8,
    },
    heroSubtitleCopy: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: 'Manrope_600SemiBold',
      maxWidth: 360,
    },
    heroStatsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
      marginBottom: 14,
    },
    heroStatPill: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.background, isDark ? 0.18 : 0.48),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      minWidth: 88,
    },
    heroStatValue: {
      color: theme.text,
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
      marginBottom: 2,
    },
    heroStatLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    heroPrimaryButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    heroPrimaryButtonText: {
      color: Colors.light.background,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    sectionCard: {
      borderRadius: 22,
      padding: 16,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.92 : 0.82),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
    },
    sectionMeta: {
      color: theme.textMuted,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: 'Manrope_500Medium',
    },
    groupBlock: {
      gap: 10,
    },
    groupTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: 'Manrope_800ExtraBold',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.background, isDark ? 0.24 : 0.66),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.06),
    },
    rowIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    rowIconPending: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
    },
    rowIconFailed: {
      backgroundColor: withAlpha(theme.danger, isDark ? 0.14 : 0.08),
      borderColor: withAlpha(theme.danger, isDark ? 0.26 : 0.18),
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowTopLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 4,
    },
    rowTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: 'Manrope_700Bold',
    },
    rowTime: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
    },
    rowDetail: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_500Medium',
    },
    rowError: {
      marginTop: 6,
      color: theme.danger,
      fontSize: 11.5,
      lineHeight: 17,
      fontFamily: 'Manrope_600SemiBold',
    },
    rowActionButton: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.26 : 0.16),
      alignSelf: 'center',
    },
    rowActionText: {
      color: theme.tint,
      fontSize: 11.5,
      fontFamily: 'Manrope_700Bold',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 2,
    },
    historyIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    historyIconCompleted: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.26 : 0.14),
    },
    historyIconFailed: {
      backgroundColor: withAlpha(theme.danger, isDark ? 0.14 : 0.08),
      borderColor: withAlpha(theme.danger, isDark ? 0.26 : 0.18),
    },
    historyBody: {
      flex: 1,
      minWidth: 0,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
    },
    historyMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    historyScopePill: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.035),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    historyScopeText: {
      color: theme.textMuted,
      fontSize: 10.5,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    historyStateText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
    },
    historyStateCompleted: {
      color: theme.tint,
    },
    historyStateFailed: {
      color: theme.danger,
    },
    historyFailureText: {
      marginTop: 6,
      color: theme.textMuted,
      fontSize: 11.5,
      lineHeight: 17,
      fontFamily: 'Manrope_500Medium',
    },
  });
