import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import {
  CalendarClock,
  Check,
  Film,
  ImagePlus,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trash2,
  UsersRound,
} from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type LiveVisualTheme, useLiveVisualTheme } from '../components/live-visual-tokens.ts';
import type {
  LiveCreationDraft,
  LiveCreationFormat,
  LiveCreationStep,
} from './live-creation-draft.ts';

const STEP_LABELS: Record<LiveCreationStep, string> = {
  moment: 'Moment',
  story: 'Story',
  room: 'Room',
  review: 'Review',
};

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'short',
}).format(new Date(value));

const formatLabel = (format: LiveCreationFormat) => format === 'quick_connect'
  ? 'Quick Connect'
  : format === 'circle_live'
    ? 'Circle Live'
    : 'Hosted Match Night';

export function LiveCreationProgress({ current }: { current: LiveCreationStep }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const steps = Object.keys(STEP_LABELS) as LiveCreationStep[];
  const currentIndex = steps.indexOf(current);
  return (
    <View accessibilityRole="progressbar" style={styles.progress}>
      {steps.map((step, index) => (
        <View key={step} style={styles.progressItem}>
          <View style={[styles.progressDot, index <= currentIndex && styles.progressDotActive]}>
            {index < currentIndex ? <Check size={11} color={visual.accentContrast} /> : (
              <Text style={[styles.progressNumber, index <= currentIndex && styles.progressNumberActive]}>
                {index + 1}
              </Text>
            )}
          </View>
          <Text style={[styles.progressLabel, index === currentIndex && styles.progressLabelActive]}>
            {STEP_LABELS[step]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FormatCard({
  active,
  icon,
  title,
  description,
  onPress,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.formatCard, active && styles.formatCardActive]}
    >
      <View style={[styles.formatIcon, active && styles.formatIconActive]}>{icon}</View>
      <Text style={styles.formatTitle}>{title}</Text>
      <Text style={styles.formatDescription}>{description}</Text>
    </Pressable>
  );
}

export function LiveCreationMomentStep({
  draft,
  onFormatChange,
}: {
  draft: LiveCreationDraft;
  onFormatChange: (format: LiveCreationFormat) => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.step}>
      <Text style={styles.kicker}>CHOOSE THE ENERGY</Text>
      <Text style={styles.stepTitle}>What kind of moment are you creating?</Text>
      <Text style={styles.stepCopy}>The format shapes admission, pacing, and the host tools waiting backstage.</Text>
      {draft.circleId ? (
        <FormatCard
          active
          icon={<UsersRound size={21} color={visual.accentContrast} />}
          title="Circle Live"
          description={`A private gathering for ${draft.circleName || 'your Circle'}, with quorum-aware confirmation.`}
          onPress={() => onFormatChange('circle_live')}
        />
      ) : (
        <View style={styles.formatRow}>
          <FormatCard
            active={draft.format === 'hosted_match_night'}
            icon={<UsersRound size={21} color={draft.format === 'hosted_match_night' ? visual.accentContrast : visual.teal} />}
            title="Hosted Match Night"
            description="Curate the stage and make thoughtful introductions."
            onPress={() => onFormatChange('hosted_match_night')}
          />
          <FormatCard
            active={draft.format === 'quick_connect'}
            icon={<TimerReset size={21} color={draft.format === 'quick_connect' ? visual.accentContrast : visual.teal} />}
            title="Quick Connect"
            description="Private timed conversations, paired by Betweener."
            onPress={() => onFormatChange('quick_connect')}
          />
        </View>
      )}
      <View style={styles.promise}>
        <ShieldCheck size={20} color={visual.teal} />
        <Text style={styles.promiseText}>Four public seats maximum. No recording, gifting, or popularity rankings.</Text>
      </View>
    </View>
  );
}

export function LiveCreationStoryStep({
  draft,
  posterUri,
  teaserSelected,
  onChange,
  onPickPoster,
  onPickTeaser,
  onRemovePoster,
  onRemoveTeaser,
  onHostNoteFocus,
}: {
  draft: LiveCreationDraft;
  posterUri: string | null;
  teaserSelected: boolean;
  onChange: (updates: Partial<LiveCreationDraft>) => void;
  onPickPoster: () => void;
  onPickTeaser: () => void;
  onRemovePoster: () => void;
  onRemoveTeaser: () => void;
  onHostNoteFocus: () => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.step}>
      <Text style={styles.kicker}>TELL THE STORY</Text>
      <Text style={styles.stepTitle}>Make the invitation feel considered.</Text>
      <Text style={styles.stepCopy}>A clear promise matters more than promotion. Poster and preview are optional.</Text>
      <View style={styles.mediaRow}>
        <Pressable onPress={onPickPoster} style={[styles.mediaCard, posterUri && styles.mediaCardImage]}>
          {posterUri ? <Image source={{ uri: posterUri }} style={styles.posterPreview} /> : (
            <><ImagePlus size={25} color={visual.teal} /><Text style={styles.mediaTitle}>Add poster</Text><Text style={styles.mediaHint}>4:5 portrait</Text></>
          )}
        </Pressable>
        <Pressable onPress={onPickTeaser} style={styles.mediaCard}>
          <Film size={25} color={visual.teal} />
          <Text style={styles.mediaTitle}>{teaserSelected ? 'Preview selected' : 'Add video preview'}</Text>
          <Text style={styles.mediaHint}>{teaserSelected ? 'Ready to publish' : 'Optional · 20s max'}</Text>
        </Pressable>
      </View>
      {posterUri || teaserSelected ? (
        <View style={styles.removeRow}>
          {posterUri ? <Pressable onPress={onRemovePoster} style={styles.remove}><Trash2 size={13} color={visual.teal} /><Text style={styles.removeText}>Remove poster</Text></Pressable> : null}
          {teaserSelected ? <Pressable onPress={onRemoveTeaser} style={styles.remove}><Trash2 size={13} color={visual.teal} /><Text style={styles.removeText}>Remove video</Text></Pressable> : null}
        </View>
      ) : null}
      <Text style={styles.label}>ROOM TITLE</Text>
      <TextInput
        accessibilityLabel="Live room title"
        value={draft.title}
        onChangeText={(title) => onChange({ title })}
        maxLength={120}
        placeholder="Ghana ↔ UK Match Night"
        placeholderTextColor={visual.textMuted}
        style={styles.input}
      />
      <Text style={styles.counter}>{draft.title.length}/120</Text>
      <Text style={styles.label}>HOST NOTE</Text>
      <TextInput
        accessibilityLabel="Live host note"
        value={draft.description}
        onChangeText={(description) => onChange({ description })}
        maxLength={1000}
        multiline
        onFocus={onHostNoteFocus}
        placeholder="Set the intention and tone for your guests."
        placeholderTextColor={visual.textMuted}
        style={[styles.input, styles.multiline]}
      />
    </View>
  );
}

export function LiveCreationRoomStep({
  draft,
  showPicker,
  onShowPicker,
  onDateChange,
  onDateDismiss,
  onChange,
}: {
  draft: LiveCreationDraft;
  showPicker: boolean;
  onShowPicker: () => void;
  onDateChange: (event: DateTimePickerChangeEvent, date: Date) => void;
  onDateDismiss: () => void;
  onChange: (updates: Partial<LiveCreationDraft>) => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.step}>
      <Text style={styles.kicker}>SHAPE THE ROOM</Text>
      <Text style={styles.stepTitle}>Set expectations before anyone arrives.</Text>
      <Text style={styles.label}>STARTS</Text>
      <Pressable onPress={onShowPicker} style={styles.dateButton}>
        <CalendarClock size={19} color={visual.teal} />
        <Text style={styles.dateText}>{formatDate(draft.scheduledStart)}</Text>
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          value={new Date(draft.scheduledStart)}
          minimumDate={new Date(Date.now() + 600_000)}
          mode="datetime"
          onValueChange={onDateChange}
          onDismiss={onDateDismiss}
          textColor={visual.text}
        />
      ) : null}
      <Text style={styles.label}>PLANNED DURATION</Text>
      <View style={styles.durationRow}>
        {[45, 60, 90].map((minutes) => (
          <Pressable
            key={minutes}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.durationMinutes === minutes }}
            onPress={() => onChange({ durationMinutes: minutes })}
            style={[styles.duration, draft.durationMinutes === minutes && styles.durationActive]}
          >
            <Text style={[styles.durationText, draft.durationMinutes === minutes && styles.durationTextActive]}>{minutes} min</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.settingCard}>
        <View style={styles.settingIcon}><Sparkles size={18} color={visual.purple} /></View>
        <View style={styles.settingCopy}>
          <Text style={styles.settingTitle}>Chemistry First</Text>
          <Text style={styles.settingDescription}>Faces reveal only when both people are ready.</Text>
        </View>
        <Switch
          accessibilityLabel="Enable Chemistry First"
          value={draft.chemistryFirstEnabled}
          onValueChange={(chemistryFirstEnabled) => onChange({ chemistryFirstEnabled })}
          trackColor={{ false: visual.borderStrong, true: visual.purpleSoft }}
          thumbColor={draft.chemistryFirstEnabled ? visual.purple : visual.textMuted}
        />
      </View>
      {draft.circleId ? (
        <>
          <Text style={styles.label}>MINIMUM PEOPLE</Text>
          <TextInput
            accessibilityLabel="Minimum Circle participants"
            value={String(draft.minimumParticipants)}
            onChangeText={(value) => onChange({
              minimumParticipants: Math.max(0, Number.parseInt(value.replace(/[^0-9]/g, ''), 10) || 0),
            })}
            keyboardType="number-pad"
            maxLength={3}
            style={styles.input}
          />
          <Text style={styles.fieldHint}>The room confirms when this many members save a place. The host is not counted.</Text>
        </>
      ) : null}
      <View style={styles.promise}>
        <UsersRound size={20} color={visual.teal} />
        <Text style={styles.promiseText}>Guests enter through the lobby. Your private backstage opens before the room goes Live.</Text>
      </View>
    </View>
  );
}

export function LiveCreationPreviewCard({
  draft,
  posterUri,
}: {
  draft: LiveCreationDraft;
  posterUri: string | null;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.previewCard}>
      {posterUri ? <Image source={{ uri: posterUri }} style={styles.previewImage} /> : <View style={styles.previewArt}><Sparkles size={32} color={visual.teal} /></View>}
      <View style={styles.previewBody}>
        <Text style={styles.previewEyebrow}>{formatLabel(draft.format).toUpperCase()}</Text>
        <Text style={styles.previewTitle}>{draft.title.trim() || 'Your Live title'}</Text>
        <Text style={styles.previewDescription}>{draft.description.trim() || 'Your host note will welcome guests here.'}</Text>
        <View style={styles.previewMeta}>
          <CalendarClock size={15} color={visual.teal} />
          <Text style={styles.previewMetaText}>{formatDate(draft.scheduledStart)} · {draft.durationMinutes} min</Text>
        </View>
      </View>
    </View>
  );
}

export function LiveCreationReviewStep({
  draft,
  posterUri,
  isEditing,
}: {
  draft: LiveCreationDraft;
  posterUri: string | null;
  isEditing: boolean;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.step}>
      <Text style={styles.kicker}>GUEST VIEW</Text>
      <Text style={styles.stepTitle}>{isEditing ? 'Review the new version.' : 'One last look before it goes out.'}</Text>
      <Text style={styles.stepCopy}>This is the promise guests will see in Live and, for Circle Live, in the linked Gathering.</Text>
      <LiveCreationPreviewCard draft={draft} posterUri={posterUri} />
      <View style={styles.reviewFacts}>
        <View style={styles.reviewFact}><Check size={16} color={visual.teal} /><Text style={styles.reviewFactText}>Private backstage and device check included</Text></View>
        <View style={styles.reviewFact}><Check size={16} color={visual.teal} /><Text style={styles.reviewFactText}>Guests are notified if you reschedule or cancel</Text></View>
        <View style={styles.reviewFact}><Check size={16} color={visual.teal} /><Text style={styles.reviewFactText}>Published Lives retain a safety record; completed or cancelled rooms can be archived</Text></View>
      </View>
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  progress: { flexDirection: 'row', paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: visual.border },
  progressItem: { flex: 1, alignItems: 'center', gap: 5 },
  progressDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.borderStrong },
  progressDotActive: { backgroundColor: visual.teal, borderColor: visual.teal },
  progressNumber: { color: visual.textMuted, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  progressNumberActive: { color: visual.accentContrast },
  progressLabel: { color: visual.textMuted, fontSize: 8, fontFamily: 'Manrope_700Bold' },
  progressLabelActive: { color: visual.text },
  step: { gap: 4 },
  kicker: { color: visual.teal, fontSize: 9, letterSpacing: 1.8, fontFamily: 'Manrope_800ExtraBold' },
  stepTitle: { color: visual.text, fontSize: 30, lineHeight: 35, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 7 },
  stepCopy: { color: visual.textMuted, fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium', marginTop: 6, marginBottom: 18 },
  promise: { flexDirection: 'row', gap: 11, borderRadius: 20, padding: 16, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border, marginTop: 18 },
  promiseText: { flex: 1, color: visual.textMuted, fontSize: 11, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  formatRow: { flexDirection: 'row', gap: 10 },
  formatCard: { flex: 1, minHeight: 170, borderRadius: 24, padding: 16, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  formatCardActive: { borderColor: visual.teal, backgroundColor: visual.tealSoft },
  formatIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surfaceSoft, marginBottom: 13 },
  formatIconActive: { backgroundColor: visual.teal },
  formatTitle: { color: visual.text, fontSize: 14, lineHeight: 18, fontFamily: 'Manrope_800ExtraBold', marginBottom: 7 },
  formatDescription: { color: visual.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  mediaRow: { flexDirection: 'row', gap: 10 },
  mediaCard: { flex: 1, minHeight: 150, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  mediaCardImage: { padding: 0 },
  posterPreview: { width: '100%', height: 150 },
  mediaTitle: { color: visual.text, fontSize: 11, marginTop: 9, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold' },
  mediaHint: { color: visual.textMuted, fontSize: 9, marginTop: 4, fontFamily: 'Manrope_500Medium' },
  removeRow: { flexDirection: 'row', gap: 14, marginTop: 9 },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  removeText: { color: visual.teal, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  label: { color: visual.teal, fontSize: 9, letterSpacing: 1.6, fontFamily: 'Manrope_800ExtraBold', marginBottom: 8, marginTop: 16 },
  input: { minHeight: 56, borderRadius: 18, paddingHorizontal: 16, color: visual.text, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border, fontFamily: 'Manrope_500Medium' },
  multiline: { minHeight: 116, paddingTop: 15, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', color: visual.textMuted, fontSize: 8, marginTop: 4, fontFamily: 'Manrope_600SemiBold' },
  fieldHint: { color: visual.textMuted, fontSize: 9, lineHeight: 14, marginTop: 7, fontFamily: 'Manrope_500Medium' },
  dateButton: { minHeight: 58, borderRadius: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  dateText: { color: visual.text, fontSize: 13, flex: 1, fontFamily: 'Manrope_600SemiBold' },
  durationRow: { flexDirection: 'row', gap: 9 },
  duration: { flex: 1, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  durationActive: { backgroundColor: visual.teal, borderColor: visual.teal },
  durationText: { color: visual.textMuted, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  durationTextActive: { color: visual.accentContrast },
  settingCard: { minHeight: 90, marginTop: 18, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: visual.borderStrong, backgroundColor: visual.surface, flexDirection: 'row', alignItems: 'center', gap: 11 },
  settingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.purpleSoft },
  settingCopy: { flex: 1 },
  settingTitle: { color: visual.text, fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  settingDescription: { color: visual.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium', marginTop: 3 },
  previewCard: { borderRadius: 28, overflow: 'hidden', backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.borderStrong },
  previewImage: { height: 260, width: '100%' },
  previewArt: { height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.tealSoft },
  previewBody: { padding: 18 },
  previewEyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  previewTitle: { color: visual.text, fontSize: 26, lineHeight: 31, marginTop: 6, fontFamily: 'PlayfairDisplay_700Bold' },
  previewDescription: { color: visual.textMuted, fontSize: 11, lineHeight: 18, marginTop: 8, fontFamily: 'Manrope_500Medium' },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15 },
  previewMetaText: { flex: 1, color: visual.text, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_700Bold' },
  reviewFacts: { borderRadius: 20, padding: 15, backgroundColor: visual.surfaceSoft, gap: 12, marginTop: 16 },
  reviewFact: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  reviewFactText: { flex: 1, color: visual.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_600SemiBold' },
});
