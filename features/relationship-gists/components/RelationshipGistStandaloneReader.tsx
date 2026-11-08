import { Colors } from '@/constants/theme';
import { RelationshipGistCover } from '@/features/relationship-gists/components/RelationshipGistCover';
import { RelationshipGistEngagementPanel } from '@/features/relationship-gists/components/RelationshipGistEngagementPanel';
import { createCurrentRelationshipGistLinks } from '@/features/relationship-gists/config/relationship-gist-link-runtime';
import { loadRelationshipGistCatalog } from '@/features/relationship-gists/data/relationship-gist-catalog';
import {
  buildRelationshipGistReaderContent,
  calculateRelationshipGistReaderProgress,
  getRelationshipGistReadTimeLabel,
  resolveRelationshipGistResumeOffset,
  type RelationshipGist,
} from '@/features/relationship-gists/domain/relationship-gist';
import type { RelationshipGistEngagementSource } from '@/features/relationship-gists/engagement/relationship-gist-engagement';
import { getRelationshipGistProgressBucket } from '@/features/relationship-gists/engagement/relationship-gist-engagement';
import { useRelationshipGistEngagement } from '@/features/relationship-gists/hooks/use-relationship-gist-engagement';
import { useRelationshipGistReaderState } from '@/features/relationship-gists/hooks/use-relationship-gist-reader-state';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { getDefaultRelationshipGistLocalState } from '@/lib/relationship-gists/local-state';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const normalizePerspective = (value?: string | null) =>
  String(value ?? 'general').trim().toLowerCase() || 'general';

const perspectiveLabel = (value: string) =>
  value === 'general' ? 'General' : `${value[0].toUpperCase()}${value.slice(1)}`;

export function RelationshipGistStandaloneReader({
  gistId,
  initialPerspective,
  source,
}: {
  gistId: string;
  initialPerspective?: string | null;
  source: RelationshipGistEngagementSource;
}) {
  const { user, profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [catalog, setCatalog] = useState<RelationshipGist[]>([]);
  const [perspective, setPerspective] = useState(normalizePerspective(initialPerspective));
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsAcknowledgement, setNeedsAcknowledgement] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const restoreAppliedRef = useRef(false);
  const loadRequestRef = useRef(0);

  const variants = useMemo(
    () => catalog.filter((item) => item.id === gistId),
    [catalog, gistId],
  );
  const availablePerspectives = useMemo(
    () => Array.from(new Set(variants.map((item) => normalizePerspective(item.perspective)))),
    [variants],
  );
  const gist = variants.find((item) => normalizePerspective(item.perspective) === perspective)
    ?? variants.find((item) => normalizePerspective(item.perspective) === 'general')
    ?? variants[0]
    ?? null;
  const activePerspective = normalizePerspective(gist?.perspective ?? perspective);
  const readerContent = useMemo(
    () => buildRelationshipGistReaderContent(gist, activePerspective),
    [activePerspective, gist],
  );

  const {
    stateMap,
    syncIssue,
    queueProgress,
    flushPendingProgress,
    flushReadingDuration,
    toggleSaved,
    acknowledgeRead,
  } = useRelationshipGistReaderState({
    userId: user?.id ?? null,
    profileId: profile?.id ?? null,
    activeGistId: gist?.id ?? null,
    perspective: activePerspective,
    readerOpen: Boolean(gist),
  });
  const engagement = useRelationshipGistEngagement({
    userId: user?.id ?? null,
    gistId: gist?.id ?? null,
    readerOpen: Boolean(gist),
    source,
  });
  const localState = gist
    ? stateMap[gist.id] ?? getDefaultRelationshipGistLocalState(activePerspective)
    : null;

  const load = useCallback(async (forceNetwork: boolean) => {
    const requestId = ++loadRequestRef.current;
    if (!user?.id) {
      setCatalog([]);
      setLoading(false);
      setLoadError('Sign in to open this Relationship Gist.');
      return;
    }
    if (forceNetwork) setRefreshing(true);
    else setLoading(true);
    try {
      const network = await fetchNetInfo().catch(() => null);
      const networkAllowed = forceNetwork || (
        network?.isConnected !== false && network?.isInternetReachable !== false
      );
      const result = await loadRelationshipGistCatalog(
        supabase as any,
        user.id,
        { networkAllowed },
      );
      if (requestId !== loadRequestRef.current) return;
      setCatalog(result.items);
      setLoadError(null);
      setNotice(result.source === 'cache'
        ? 'Showing the latest Relationship Gists saved on this device.'
        : null);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setLoadError('This Relationship Gist is unavailable until the connection is restored.');
      logger.warn('[relationship-gist] canonical_reader_load_failed', {
        code: String((error as any)?.code ?? (error as Error)?.name ?? 'unknown'),
      });
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    setCatalog([]);
    setLoadError(null);
    setNotice(null);
    void load(false);
    return () => {
      loadRequestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!availablePerspectives.length || availablePerspectives.includes(perspective)) return;
    setPerspective(availablePerspectives.includes('general') ? 'general' : availablePerspectives[0]);
  }, [availablePerspectives, perspective]);

  useEffect(() => {
    restoreAppliedRef.current = false;
    contentHeightRef.current = 0;
    viewportHeightRef.current = 0;
  }, [expanded, gist?.id, activePerspective]);

  const restorePosition = useCallback(() => {
    if (!expanded || restoreAppliedRef.current || !localState) return;
    const target = resolveRelationshipGistResumeOffset({
      anchor: null,
      anchorOffset: null,
      progress: localState.progress,
      sectionOffsets: {},
      contentHeight: contentHeightRef.current,
      viewportHeight: viewportHeightRef.current,
    });
    if (target == null) return;
    restoreAppliedRef.current = true;
    if (target > 1) scrollRef.current?.scrollTo({ y: target, animated: false });
  }, [expanded, localState]);

  const recordProgress = useCallback((offsetY: number, contentHeight: number, viewportHeight: number) => {
    if (!expanded || !gist) return;
    const signal = calculateRelationshipGistReaderProgress({
      offsetY,
      contentHeight,
      viewportHeight,
      previousProgress: localState?.progress ?? 0,
      layoutReady: contentHeight > 0 && viewportHeight > 0,
      readAcknowledged: localState?.readAcknowledgedAt != null,
    });
    setNeedsAcknowledgement(signal.needsReadAcknowledgement);
    queueProgress(gist.id, {
      progress: signal.progress,
      lastReadAt: Date.now(),
      lastPerspective: activePerspective,
      scrollCompleted: signal.scrollCompleted,
    });
    void engagement.track('progress', getRelationshipGistProgressBucket(signal.progress));
  }, [activePerspective, engagement, expanded, gist, localState?.progress, localState?.readAcknowledgedAt, queueProgress]);

  const handleClose = useCallback(() => {
    void flushPendingProgress();
    void flushReadingDuration();
    router.back();
  }, [flushPendingProgress, flushReadingDuration]);

  const handleShare = useCallback(async () => {
    if (!gist) return;
    try {
      const links = createCurrentRelationshipGistLinks(gist.id, activePerspective);
      const result = await Share.share({
        message: [gist.title, readerContent.lead, links.webLink].filter(Boolean).join('\n\n'),
        url: links.webLink,
      });
      if (result.action === Share.sharedAction) void engagement.track('share');
    } catch (error) {
      logger.warn('[relationship-gist] canonical_share_failed', {
        code: String((error as Error)?.name ?? 'unknown'),
      });
    }
  }, [activePerspective, engagement, gist, readerContent.lead]);

  if (loading && !catalog.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.tint} />
          <Text style={[styles.supporting, styles.supportingCentered]}>Opening Relationship Gist…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!gist) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Go back">
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <MaterialCommunityIcons name="book-off-outline" size={34} color={theme.tint} />
          <Text style={styles.emptyTitle}>Gist unavailable</Text>
          <Text style={[styles.supporting, styles.supportingCentered]}>{loadError ?? 'This Gist may have been unpublished or archived.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load(true)} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const completed = (localState?.progress ?? 0) >= 0.995;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Relationship Gist</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconButton, localState?.saved && styles.iconButtonActive]}
            onPress={() => {
              void engagement.track(localState?.saved ? 'unsave' : 'save');
              void toggleSaved(gist.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={localState?.saved ? 'Remove Gist from saved' : 'Save Gist'}
            accessibilityState={{ selected: localState?.saved === true }}
          >
            <MaterialCommunityIcons name={localState?.saved ? 'bookmark' : 'bookmark-outline'} size={19} color={localState?.saved ? theme.tint : theme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => void handleShare()} accessibilityRole="button" accessibilityLabel="Share Relationship Gist">
            <MaterialCommunityIcons name="share-variant-outline" size={19} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close Relationship Gist">
            <MaterialCommunityIcons name="close" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void Promise.all([load(true), engagement.refresh()]);
          }}
          tintColor={theme.tint}
        />}
        scrollEventThrottle={32}
        onLayout={({ nativeEvent }) => {
          viewportHeightRef.current = nativeEvent.layout.height;
          setTimeout(restorePosition, 0);
        }}
        onContentSizeChange={(_width, height) => {
          contentHeightRef.current = height;
          setTimeout(restorePosition, 0);
        }}
        onScroll={({ nativeEvent }) => recordProgress(
          nativeEvent.contentOffset.y,
          nativeEvent.contentSize.height,
          nativeEvent.layoutMeasurement.height,
        )}
      >
        <Text style={styles.title}>{gist.title}</Text>
        <RelationshipGistCover
          gistId={gist.id}
          perspective={activePerspective}
          active
          ownerUserId={user?.id ?? null}
        />

        {availablePerspectives.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.perspectives}>
            {availablePerspectives.map((item) => {
              const selected = item === activePerspective;
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.perspective, selected && styles.perspectiveActive]}
                  onPress={() => setPerspective(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${perspectiveLabel(item)} perspective`}
                >
                  <Text style={[styles.perspectiveText, selected && styles.perspectiveTextActive]}>{perspectiveLabel(item)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>{perspectiveLabel(activePerspective)} lens</Text>
          <Text style={styles.lead}>{readerContent.lead}</Text>
          <Text style={styles.supporting}>Editorial guidance from Betweener, curated for the perspective you choose.</Text>
        </View>

        <TouchableOpacity
          style={styles.depthControl}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Return to the short Gist' : 'Read the full Gist guidance'}
        >
          <MaterialCommunityIcons name={expanded ? 'book-open-page-variant-outline' : 'lightning-bolt-outline'} size={19} color={theme.tint} />
          <View style={styles.depthCopy}>
            <Text style={styles.depthTitle}>{expanded ? 'Full guidance' : 'The short Gist'}</Text>
            <Text style={styles.supporting}>{expanded ? 'Hide the detail and return to the essential takeaway.' : 'Open the guided points when you want more context.'}</Text>
          </View>
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.textMuted} />
        </TouchableOpacity>

        {expanded ? (
          <>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Read this when</Text>
              <Text style={styles.body}>{readerContent.framing}</Text>
            </View>
            {readerContent.sections.map((section, index) => (
              <View key={section.id} style={styles.card}>
                <Text style={styles.sectionIndex}>{String(index + 1).padStart(2, '0')}</Text>
                {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
                <Text style={styles.body}>{section.body}</Text>
              </View>
            ))}
          </>
        ) : null}

        {readerContent.takeaway ? (
          <View style={styles.takeaway}>
            <Text style={styles.eyebrow}>Carry this with you</Text>
            <Text style={styles.takeawayText}>{readerContent.takeaway}</Text>
          </View>
        ) : null}

        <RelationshipGistEngagementPanel engagement={engagement} colors={theme} />

        {(needsAcknowledgement || (!expanded && !completed)) ? (
          <TouchableOpacity
            style={styles.markRead}
            onPress={() => {
              setNeedsAcknowledgement(false);
              void acknowledgeRead(gist.id);
            }}
            accessibilityRole="button"
            accessibilityLabel="Mark Relationship Gist as read"
            accessibilityHint="Records completion without using reading time as proof"
          >
            <MaterialCommunityIcons name="check-circle-outline" size={18} color={theme.tint} />
            <Text style={styles.markReadText}>Mark as read</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.meta}>
          <Text style={styles.metaText}>{getRelationshipGistReadTimeLabel(gist)}</Text>
          <Text style={styles.metaText}>{completed ? 'Completed' : 'Open to every Betweener member'}</Text>
        </View>
        {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
        {syncIssue ? <Text style={styles.notice} accessibilityLiveRegion="polite">{syncIssue}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: (typeof Colors)[keyof typeof Colors]) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { flexShrink: 1, color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  iconButtonActive: { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48, gap: 18 },
  title: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 36, lineHeight: 41 },
  perspectives: { gap: 8, paddingRight: 20 },
  perspective: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  perspectiveActive: { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
  perspectiveText: { color: theme.textMuted, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  perspectiveTextActive: { color: theme.text },
  heroCard: { padding: 20, borderRadius: 26, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle, gap: 12 },
  eyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  lead: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 28, lineHeight: 35 },
  supporting: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 13, lineHeight: 20 },
  supportingCentered: { textAlign: 'center' },
  depthControl: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  depthCopy: { flex: 1, gap: 3 },
  depthTitle: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 14 },
  card: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle, gap: 9 },
  sectionIndex: { color: theme.textMuted, fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1.2 },
  sectionTitle: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 25, lineHeight: 30 },
  body: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 16, lineHeight: 27 },
  takeaway: { padding: 19, borderRadius: 22, borderWidth: 1, borderColor: theme.tint, backgroundColor: `${theme.tint}12`, gap: 9 },
  takeawayText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 17, lineHeight: 27 },
  markRead: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, borderRadius: 24, borderWidth: 1, borderColor: theme.outline },
  markReadText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaText: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: theme.outline },
  notice: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 12, lineHeight: 18 },
  centered: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 28 },
  retryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint },
  retryText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 13 },
});
