import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CirclePulseMediaComposer from './CirclePulseMediaComposer';
import {
  archiveCirclePulseItem,
  cancelCircleLoveSeatNomination,
  createCirclePulseEditorialMedia,
  endCircleLoveSeat,
  featureCirclePulseItem,
  fetchCircleLoveSeatsForHost,
  nominateCircleLoveSeat,
  reorderCirclePulseItems,
} from '@/lib/circles/pulse/circle-pulse-service';
import { logger } from '@/lib/telemetry/logger';
import type {
  CircleLoveSeatCandidate,
  CircleLoveSeatHostItem,
  CirclePulseGatheringCandidate,
  CirclePulseItem,
  CirclePulseMediaCandidate,
  CirclePulsePromptCandidate,
} from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  visible: boolean;
  circleId: string;
  actorProfileId: string | null;
  hostNote?: string | null;
  prompts: CirclePulsePromptCandidate[];
  gatherings: CirclePulseGatheringCandidate[];
  media: CirclePulseMediaCandidate[];
  featuredItems: CirclePulseItem[];
  loveSeatCandidates: CircleLoveSeatCandidate[];
  onClose: () => void;
  onFeatured: () => void | Promise<void>;
  onOpenModeration?: () => void;
};

export default function CirclePulseManagerSheet({
  visible,
  circleId,
  actorProfileId,
  hostNote,
  prompts,
  gatherings,
  media,
  featuredItems,
  loveSeatCandidates,
  onClose,
  onFeatured,
  onOpenModeration,
}: Props) {
  const insets = useSafeAreaInsets();
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(insets.bottom, palette), [insets.bottom, palette]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loveSeatTarget, setLoveSeatTarget] = useState<CircleLoveSeatCandidate | null>(null);
  const [loveSeatQuote, setLoveSeatQuote] = useState('');
  const [loveSeatHostItems, setLoveSeatHostItems] = useState<CircleLoveSeatHostItem[]>([]);
  const [mediaComposerOpen, setMediaComposerOpen] = useState(false);
  const featured = useMemo(
    () => ({
      hostNote: featuredItems.some((item) => item.type === 'host_note'),
      promptIds: new Set(featuredItems.map((item) => item.promptId).filter(Boolean)),
      gatheringIds: new Set(featuredItems.map((item) => item.gatheringId).filter(Boolean)),
      momentIds: new Set(featuredItems.map((item) => item.momentId).filter(Boolean)),
      loveSeatActive: featuredItems.some((item) => item.type === 'love_seat'),
    }),
    [featuredItems],
  );
  const pendingLoveSeat = loveSeatHostItems.find((item) => item.status === 'pending_user_approval') ?? null;
  const activeLoveSeat = loveSeatHostItems.find((item) => item.status === 'active') ?? null;
  const hiddenActiveLoveSeat = activeLoveSeat && !featured.loveSeatActive ? activeLoveSeat : null;

  useEffect(() => {
    if (!visible || !circleId || !actorProfileId) return;
    let cancelled = false;
    void fetchCircleLoveSeatsForHost(circleId, actorProfileId)
      .then((items) => {
        if (!cancelled) setLoveSeatHostItems(items);
      })
      .catch((error) => {
        logger.warn('[circles] love_seat_host_items_load_failed', {
          circleId,
          actorProfileId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setLoveSeatHostItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [actorProfileId, circleId, visible]);

  const nominateLoveSeat = async () => {
    if (!circleId || !actorProfileId || !loveSeatTarget || savingKey) return;
    setSavingKey(`love-seat:${loveSeatTarget.profileId}`);
    try {
      await nominateCircleLoveSeat(circleId, actorProfileId, loveSeatTarget.profileId, loveSeatQuote);
      Alert.alert('Love Seat invitation sent', `${loveSeatTarget.name} must accept before appearing on Circle Pulse.`);
      setLoveSeatTarget(null);
      setLoveSeatQuote('');
      onClose();
    } catch (error) {
      logger.warn('[circles] love_seat_nomination_failed', {
        circleId,
        actorProfileId,
        featuredProfileId: loveSeatTarget.profileId,
        error: error instanceof Error ? error.message : String(error),
      });
      Alert.alert('Love Seat', error instanceof Error ? error.message : 'Could not send this invitation right now.');
    } finally {
      setSavingKey(null);
    }
  };

  const cancelPendingLoveSeat = async () => {
    if (!pendingLoveSeat || !actorProfileId || savingKey) return;
    setSavingKey(`love-seat-cancel:${pendingLoveSeat.id}`);
    try {
      await cancelCircleLoveSeatNomination(pendingLoveSeat.id, actorProfileId);
      setLoveSeatHostItems((items) => items.filter((item) => item.id !== pendingLoveSeat.id));
      Alert.alert('Invitation withdrawn', 'This member will no longer see the Love Seat invitation.');
    } catch (error) {
      logger.warn('[circles] love_seat_nomination_cancel_failed', {
        circleId,
        actorProfileId,
        loveSeatId: pendingLoveSeat.id,
        error: error instanceof Error ? error.message : String(error),
      });
      Alert.alert('Love Seat', error instanceof Error ? error.message : 'Could not withdraw this invitation right now.');
    } finally {
      setSavingKey(null);
    }
  };

  const endHiddenActiveLoveSeat = async () => {
    if (!hiddenActiveLoveSeat || !actorProfileId || savingKey) return;
    setSavingKey(`love-seat-end:${hiddenActiveLoveSeat.id}`);
    try {
      await endCircleLoveSeat(hiddenActiveLoveSeat.id, actorProfileId);
      setLoveSeatHostItems((items) => items.filter((item) => item.id !== hiddenActiveLoveSeat.id));
      await onFeatured();
      Alert.alert('Love Seat ended', 'This stale Love Seat has been cleared so you can nominate someone new.');
    } catch (error) {
      logger.warn('[circles] love_seat_active_end_failed', {
        circleId,
        actorProfileId,
        loveSeatId: hiddenActiveLoveSeat.id,
        error: error instanceof Error ? error.message : String(error),
      });
      Alert.alert('Love Seat', error instanceof Error ? error.message : 'Could not end this Love Seat right now.');
    } finally {
      setSavingKey(null);
    }
  };

  const archiveSpotlight = (item: CirclePulseItem) => {
    if (!actorProfileId || savingKey || item.type === 'love_seat') return;
    Alert.alert('Archive spotlight?', 'This will remove the spotlight from Circle Pulse.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          setSavingKey(`archive:${item.id}`);
          void archiveCirclePulseItem(item.id, actorProfileId)
            .then(() => onFeatured())
            .catch((error) => Alert.alert('Circle Pulse', error instanceof Error ? error.message : 'Could not archive this spotlight right now.'))
            .finally(() => setSavingKey(null));
        },
      },
    ]);
  };

  const moveSpotlight = async (itemId: string, direction: -1 | 1) => {
    if (!circleId || !actorProfileId || savingKey) return;
    const currentIndex = featuredItems.findIndex((item) => item.id === itemId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= featuredItems.length) return;
    const reordered = featuredItems.map((item) => item.id);
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    setSavingKey(`reorder:${itemId}`);
    try {
      await reorderCirclePulseItems(circleId, actorProfileId, reordered);
      await onFeatured();
    } catch (error) {
      Alert.alert('Circle Pulse', error instanceof Error ? error.message : 'Could not reorder these spotlights right now.');
    } finally {
      setSavingKey(null);
    }
  };

  const feature = async (key: string, callback: () => ReturnType<typeof featureCirclePulseItem>) => {
    if (!circleId || !actorProfileId || savingKey) return;
    setSavingKey(key);
    try {
      await callback();
      await onFeatured();
      Alert.alert('Added to Circle Pulse', 'Members will now see this spotlight on the Circle board.');
      onClose();
    } catch (error) {
      Alert.alert('Circle Pulse', error instanceof Error ? error.message : 'Could not add this spotlight right now.');
    } finally {
      setSavingKey(null);
    }
  };

  const publishEditorialMedia = async (input: Parameters<typeof createCirclePulseEditorialMedia>[2]) => {
    if (!circleId || !actorProfileId || savingKey) return;
    setSavingKey('editorial-media');
    try {
      await createCirclePulseEditorialMedia(circleId, actorProfileId, input);
      await onFeatured();
      Alert.alert('Added to Circle Pulse', 'Members will now see this Circle Media spotlight.');
      setMediaComposerOpen(false);
      onClose();
    } catch (error) {
      Alert.alert('Circle Media', error instanceof Error ? error.message : 'Could not publish this Circle Media right now.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
        >
          <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Circle Pulse</Text>
            <Text style={styles.title}>Add a thoughtful spotlight</Text>
            <Text style={styles.subtitle}>Choose something timely and useful for the Circle.</Text>
          </View>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={18} color={palette.text} />
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          {onOpenModeration ? (
            <Pressable
              accessibilityLabel="Review Pulse reports"
              style={styles.moderationEntry}
              onPress={() => {
                onClose();
                onOpenModeration();
              }}
            >
              <View style={styles.moderationIcon}>
                <MaterialCommunityIcons name="shield-alert-outline" size={18} color={palette.warning} />
              </View>
              <View style={styles.moderationCopy}>
                <Text style={styles.moderationTitle}>Review Pulse reports</Text>
                <Text style={styles.subtitle}>Handle private concerns raised in spotlight discussions.</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={19} color={palette.textMuted} />
            </Pressable>
          ) : null}
          {featuredItems.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Current Pulse</Text>
                <Text style={styles.subtitle}>Keep the board timely. Reorder active spotlights or archive what has passed.</Text>
              </View>
              {featuredItems.map((item, index) => (
                <View key={`active:${item.id}`} style={styles.activeSpotlightRow}>
                  <View style={styles.activeSpotlightCopy}>
                    <Text style={styles.activeSpotlightLabel}>{item.type.replace('_', ' ')}</Text>
                    <Text style={styles.activeSpotlightTitle} numberOfLines={1}>{item.title || 'Circle spotlight'}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Move spotlight up"
                    style={styles.spotlightIconButton}
                    disabled={index === 0 || !!savingKey}
                    onPress={() => void moveSpotlight(item.id, -1)}
                  >
                    <MaterialCommunityIcons name="arrow-up" size={16} color={index === 0 ? palette.outline : palette.textMuted} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Move spotlight down"
                    style={styles.spotlightIconButton}
                    disabled={index === featuredItems.length - 1 || !!savingKey}
                    onPress={() => void moveSpotlight(item.id, 1)}
                  >
                    <MaterialCommunityIcons name="arrow-down" size={16} color={index === featuredItems.length - 1 ? palette.outline : palette.textMuted} />
                  </Pressable>
                  {item.type !== 'love_seat' ? (
                    <Pressable
                      accessibilityLabel="Archive spotlight"
                      style={styles.spotlightIconButton}
                      disabled={!!savingKey}
                      onPress={() => archiveSpotlight(item)}
                    >
                      <MaterialCommunityIcons name="archive-outline" size={16} color={palette.danger} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <View style={styles.divider} />
            </>
          ) : null}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Love Seat</Text>
            <Text style={styles.subtitle}>Nominate one consenting member for a thoughtful Circle spotlight.</Text>
          </View>
          {featured.loveSeatActive ? (
            <Text style={styles.activeNote}>A Love Seat feature is already active in this Circle.</Text>
          ) : hiddenActiveLoveSeat ? (
            <View style={styles.pendingLoveSeat}>
              <Text style={styles.composerLabel}>Active Love Seat</Text>
              <Text style={styles.pendingLoveSeatName}>{hiddenActiveLoveSeat.featuredProfileName}</Text>
              <Text style={styles.subtitle}>This Love Seat is still active in Circle records, but it is no longer surfacing on Pulse. End it to free the slot.</Text>
              <TouchableOpacity style={styles.cancelPendingButton} disabled={!!savingKey} onPress={() => void endHiddenActiveLoveSeat()}>
                <Text style={styles.cancelPendingText}>{savingKey ? 'Ending' : 'End Love Seat'}</Text>
              </TouchableOpacity>
            </View>
          ) : pendingLoveSeat ? (
            <View style={styles.pendingLoveSeat}>
              <Text style={styles.composerLabel}>Invitation pending</Text>
              <Text style={styles.pendingLoveSeatName}>{pendingLoveSeat.featuredProfileName}</Text>
              <Text style={styles.subtitle}>Waiting for this member to accept before the spotlight appears publicly.</Text>
              <TouchableOpacity style={styles.cancelPendingButton} disabled={!!savingKey} onPress={() => void cancelPendingLoveSeat()}>
                <Text style={styles.cancelPendingText}>{savingKey ? 'Withdrawing' : 'Withdraw invitation'}</Text>
              </TouchableOpacity>
            </View>
          ) : loveSeatTarget ? (
            <View style={styles.loveSeatComposer}>
              <Text style={styles.composerLabel}>Invite {loveSeatTarget.name}</Text>
              <Text style={styles.subtitle}>Add an optional quote for the spotlight. They choose whether to accept.</Text>
              <TextInput
                value={loveSeatQuote}
                onChangeText={setLoveSeatQuote}
                placeholder="A short, intentional quote..."
                placeholderTextColor={palette.textFaint}
                multiline
                maxLength={320}
                style={styles.quoteInput}
              />
              <View style={styles.composerActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setLoveSeatTarget(null)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nominateButton} onPress={() => void nominateLoveSeat()}>
                  <Text style={styles.nominateText}>{savingKey ? 'Sending' : 'Send invitation'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            loveSeatCandidates.slice(0, 8).map((candidate) => (
              <CandidateRow
                key={`love-seat:${candidate.profileId}`}
                icon="heart-outline"
                label="Love Seat"
                title={`${candidate.name}${candidate.age ? `, ${candidate.age}` : ''}`}
                body={candidate.location || 'Circle member'}
                featured={false}
                saving={false}
                onPress={() => setLoveSeatTarget(candidate)}
              />
            ))
          )}
          <View style={styles.divider} />
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Prompts, Gatherings, and Notes</Text>
            <Text style={styles.subtitle}>Feature a curated Circle update that is already ready to share.</Text>
          </View>
          {hostNote ? (
            <CandidateRow
              icon="message-text-outline"
              label="Host Note"
              title="Feature the current host note"
              body={hostNote}
              featured={featured.hostNote}
              saving={savingKey === 'host-note'}
              onPress={() => void feature('host-note', () => featureCirclePulseItem(circleId, actorProfileId!, { type: 'host_note' }))}
            />
          ) : null}
          {prompts.map((prompt) => (
            <CandidateRow
              key={prompt.id}
              icon="comment-question-outline"
              label="Prompt"
              title={prompt.title}
              body={prompt.prompt}
              featured={featured.promptIds.has(prompt.id)}
              saving={savingKey === `prompt:${prompt.id}`}
              onPress={() => void feature(`prompt:${prompt.id}`, () => featureCirclePulseItem(circleId, actorProfileId!, { type: 'prompt', promptId: prompt.id }))}
            />
          ))}
          {gatherings.map((gathering) => (
            <CandidateRow
              key={gathering.id}
              icon="calendar-heart"
              label="Gathering"
              title={gathering.title}
              body={new Date(gathering.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              featured={featured.gatheringIds.has(gathering.id)}
              saving={savingKey === `gathering:${gathering.id}`}
              onPress={() => void feature(`gathering:${gathering.id}`, () => featureCirclePulseItem(circleId, actorProfileId!, { type: 'gathering', gatheringId: gathering.id }))}
            />
          ))}
          {!hostNote && prompts.length === 0 && gatherings.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="pulse" size={25} color={palette.teal} />
              <Text style={styles.emptyTitle}>No curated updates ready</Text>
              <Text style={styles.subtitle}>Create a Prompt, add a host note, or wait for an approved Gathering.</Text>
            </View>
          ) : null}
          <View style={styles.divider} />
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Circle Media</Text>
            <Text style={styles.subtitle}>Share host-curated images, short guides, and Circle promotions with members.</Text>
          </View>
          {mediaComposerOpen ? (
            <CirclePulseMediaComposer
              saving={savingKey === 'editorial-media'}
              onCancel={() => setMediaComposerOpen(false)}
              onPublish={publishEditorialMedia}
            />
          ) : (
            <TouchableOpacity style={styles.addCircleMediaButton} onPress={() => setMediaComposerOpen(true)}>
              <MaterialCommunityIcons name="plus-circle-outline" size={17} color={palette.tealInk} />
              <Text style={styles.addCircleMediaText}>Add Circle media</Text>
            </TouchableOpacity>
          )}
          {media.length > 0 ? (
            <>
              <View style={styles.divider} />
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Member Moments</Text>
                <Text style={styles.subtitle}>Optionally spotlight a fresh photo or video Moment from a visible Circle member.</Text>
              </View>
              {media.map((item) => (
                <CandidateRow
                  key={item.id}
                  icon={item.momentType === 'video' ? 'play-circle-outline' : 'image-outline'}
                  label="Moment"
                  title={item.title}
                  body={item.subtitle || 'Feature this member Moment.'}
                  featured={featured.momentIds.has(item.id)}
                  saving={savingKey === `media:${item.id}`}
                  onPress={() => void feature(`media:${item.id}`, () => featureCirclePulseItem(circleId, actorProfileId!, {
                    type: 'media',
                    momentId: item.id,
                    title: item.title,
                  }))}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function CandidateRow({
  icon,
  label,
  title,
  body,
  featured,
  saving,
  onPress,
}: {
  icon: string;
  label: string;
  title: string;
  body: string;
  featured: boolean;
  saving: boolean;
  onPress: () => void;
}) {
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStaticStyles(palette), [palette]);
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon as any} size={19} color={palette.teal} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowBody} numberOfLines={2}>{body}</Text>
      </View>
      <TouchableOpacity style={[styles.addButton, featured && styles.addButtonFeatured]} disabled={saving || featured} onPress={onPress}>
        <MaterialCommunityIcons name={saving ? 'loading' : featured ? 'check' : 'plus'} size={18} color={featured ? palette.teal : palette.tealInk} />
      </TouchableOpacity>
    </View>
  );
}

const createStaticStyles = (palette: CirclePulsePalette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 78,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.outlineSoft,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tealSoft,
  },
  rowCopy: { flex: 1, gap: 3 },
  rowLabel: { color: palette.purple, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  rowTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
  rowBody: { color: palette.textSoft, fontSize: 11, lineHeight: 16 },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tealStrong,
  },
  addButtonFeatured: {
    borderWidth: 1,
    borderColor: palette.tealBorder,
    backgroundColor: palette.tealSoft,
  },
});

const createStyles = (bottomInset: number, palette: CirclePulsePalette) =>
  StyleSheet.create({
    modal: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: palette.overlay },
    keyboardArea: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      width: '100%',
      maxHeight: '78%',
      paddingTop: 9,
      paddingHorizontal: 18,
      paddingBottom: Math.max(18, bottomInset),
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.surfaceStrong,
    },
    handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: palette.outline },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 16, paddingBottom: 8 },
    headerCopy: { flex: 1, gap: 4 },
    eyebrow: { color: palette.teal, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
    title: { color: palette.text, fontSize: 20, lineHeight: 25, fontFamily: 'PlayfairDisplay_700Bold' },
    subtitle: { color: palette.textSoft, fontSize: 12, lineHeight: 17 },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surfaceMuted,
    },
    content: { paddingBottom: 8 },
    moderationEntry: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, marginVertical: 6, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: palette.outline },
    moderationIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(231,199,126,0.1)' },
    moderationCopy: { flex: 1, gap: 2 },
    moderationTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
    sectionHeader: { gap: 3, paddingTop: 7, paddingBottom: 3 },
    sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
    composerLabel: { color: palette.purple, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
    activeNote: { color: palette.teal, fontSize: 12, lineHeight: 17, paddingVertical: 10 },
    activeSpotlightRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 5, borderBottomWidth: 1, borderBottomColor: palette.outlineSoft },
    activeSpotlightCopy: { flex: 1, gap: 2 },
    activeSpotlightLabel: { color: palette.purple, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
    activeSpotlightTitle: { color: palette.text, fontSize: 12, fontWeight: '800' },
    spotlightIconButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: palette.surfaceMuted },
    loveSeatComposer: { gap: 9, paddingVertical: 10 },
    pendingLoveSeat: { gap: 6, paddingVertical: 10 },
    pendingLoveSeatName: { color: palette.text, fontSize: 14, fontWeight: '900' },
    cancelPendingButton: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, marginTop: 2, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(232,138,149,0.38)' },
    cancelPendingText: { color: palette.danger, fontSize: 11, fontWeight: '900' },
    quoteInput: { minHeight: 80, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: palette.outline, color: palette.text, fontSize: 12, lineHeight: 18, textAlignVertical: 'top' },
    composerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    cancelButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: palette.outline },
    cancelText: { color: palette.text, fontSize: 11, fontWeight: '800' },
    nominateButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18, backgroundColor: palette.tealStrong },
    nominateText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
    divider: { height: 1, marginVertical: 8, backgroundColor: palette.outline },
    empty: { gap: 8, paddingVertical: 24 },
    emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    addCircleMediaButton: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, paddingHorizontal: 13, borderRadius: 19, backgroundColor: palette.teal },
    addCircleMediaText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
  });
