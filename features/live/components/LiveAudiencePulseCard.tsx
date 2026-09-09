import { BarChart3, Check, ChevronRight, MessageCircleQuestion, X } from 'lucide-react-native';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  LiveAudiencePoll,
  LiveAudiencePollTemplate,
  LiveAudiencePulseSnapshot,
} from '../application/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export type LiveAudiencePulseCardProps = {
  pulse: LiveAudiencePulseSnapshot;
  busy?: boolean;
  disabled?: boolean;
  onOpen: (templateKey: string) => Promise<unknown>;
  onVote: (pollId: string, optionId: string) => Promise<unknown>;
  onClose: (pollId: string) => Promise<unknown>;
  presentation?: 'compact' | 'studio' | 'trigger';
  openRequest?: number;
};

const PollOption = memo(function PollOption({
  poll,
  option,
  disabled,
  onVote,
}: {
  poll: LiveAudiencePoll;
  option: LiveAudiencePoll['options'][number];
  disabled: boolean;
  onVote: (pollId: string, optionId: string) => Promise<unknown>;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const selected = poll.myOptionId === option.id;
  const revealResults = poll.myOptionId !== null || poll.state !== 'open';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.label}${revealResults ? `, ${option.percentage} percent` : ''}`}
      disabled={disabled || poll.myOptionId !== null || poll.state !== 'open'}
      onPress={() => void onVote(poll.id, option.id)}
      style={[styles.option, selected && styles.optionSelected]}
    >
      {revealResults ? (
        <View
          pointerEvents="none"
          style={[styles.optionProgress, { width: `${option.percentage}%` }]}
        />
      ) : null}
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
      {selected ? <Check color={visual.color.accentContrast} size={15} strokeWidth={2.5} /> : null}
      {revealResults && !selected ? (
        <Text style={styles.percentage}>{option.percentage}%</Text>
      ) : null}
    </Pressable>
  );
});

const TemplateRow = ({
  template,
  disabled,
  onChoose,
}: {
  template: LiveAudiencePollTemplate;
  disabled: boolean;
  onChoose: (templateKey: string) => void;
}) => {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={() => onChoose(template.templateKey)}
    style={styles.templateRow}
  >
    <View style={styles.templateCopy}>
      <Text style={styles.templateKind}>
        {template.pollKind === 'question_poll' ? 'HOST QUESTION' : 'ROOM QUESTION'}
      </Text>
      <Text style={styles.templatePrompt}>{template.prompt}</Text>
    </View>
    <ChevronRight color={visual.color.teal} size={18} />
  </Pressable>
};

export const LiveAudiencePulseCard = memo(function LiveAudiencePulseCard({
  pulse,
  busy = false,
  disabled = false,
  onOpen,
  onVote,
  onClose,
  presentation = 'compact',
  openRequest = 0,
}: LiveAudiencePulseCardProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const poll = pulse.activePoll ?? pulse.recentPoll;
  const activePollId = pulse.activePoll?.id ?? null;
  const isActive = pulse.activePoll?.id === poll?.id;
  const canOpen = pulse.canManage && !pulse.activePoll && pulse.templates.length > 0;

  useEffect(() => {
    if (openRequest > 0 && activePollId) setPollOpen(true);
  }, [activePollId, openRequest]);
  const status = useMemo(() => {
    if (!poll) return null;
    if (!isActive) return 'CLOSED';
    if (poll.myOptionId) return 'RESPONSE SAVED';
    return 'OPEN';
  }, [isActive, poll]);

  const chooseTemplate = (templateKey: string) => {
    setPickerOpen(false);
    void onOpen(templateKey);
  };

  if (presentation === 'trigger') {
    const activePoll = pulse.activePoll;
    if (!activePoll) return null;
    return (
      <>
        <Pressable
          accessibilityLabel={`Respond to Audience Pulse: ${activePoll.prompt}`}
          accessibilityRole="button"
          disabled={disabled || busy}
          onPress={() => setPollOpen(true)}
          style={styles.trigger}
        >
          {busy
            ? <ActivityIndicator color={visual.color.teal} size="small" />
            : <BarChart3 color={visual.color.teal} size={17} />}
        </Pressable>
        <Modal animationType="slide" transparent visible={pollOpen} onRequestClose={() => setPollOpen(false)}>
          <Pressable onPress={() => setPollOpen(false)} style={styles.modalBackdrop}>
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetEyebrow}>AUDIENCE PULSE</Text>
                  <Text style={styles.sheetTitle}>Room perspective.</Text>
                </View>
                <Pressable accessibilityLabel="Close Audience Pulse" accessibilityRole="button" onPress={() => setPollOpen(false)} style={styles.sheetClose}>
                  <X color={visual.color.text} size={19} />
                </Pressable>
              </View>
              <Text style={[styles.prompt, styles.sheetPrompt]}>{activePoll.prompt}</Text>
              <View style={styles.options}>
                {activePoll.options.map((option) => (
                  <PollOption key={option.id} poll={activePoll} option={option} disabled={disabled || busy} onVote={onVote} />
                ))}
              </View>
              <Text style={[styles.responseCount, styles.triggerResponseCount]}>
                {activePoll.totalVotes} {activePoll.totalVotes === 1 ? 'response' : 'responses'} · No names shared
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  if (!poll && !canOpen) return null;

  if (presentation === 'compact') {
    return (
      <>
        <Pressable
          accessibilityLabel={poll ? `Open Audience Pulse: ${poll.prompt}` : 'Open Audience Pulse'}
          accessibilityRole="button"
          disabled={disabled || busy}
          onPress={() => poll ? setPollOpen(true) : setPickerOpen(true)}
          style={styles.compactCard}
        >
          <View style={styles.cardTitleRow}>
            <BarChart3 color={visual.color.teal} size={14} />
            <View style={styles.compactCopy}>
              <Text style={styles.eyebrow}>AUDIENCE PULSE</Text>
              <Text numberOfLines={1} style={styles.compactPrompt}>
                {poll?.prompt ?? 'Ask the room a thoughtful question'}
              </Text>
            </View>
          </View>
          {busy
            ? <ActivityIndicator color={visual.color.teal} size="small" />
            : <ChevronRight color={visual.color.teal} size={18} />}
        </Pressable>

        <Modal animationType="slide" transparent visible={pollOpen} onRequestClose={() => setPollOpen(false)}>
          <Pressable onPress={() => setPollOpen(false)} style={styles.modalBackdrop}>
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetEyebrow}>AUDIENCE PULSE</Text>
                  <Text style={styles.sheetTitle}>Room perspective.</Text>
                </View>
                <Pressable accessibilityLabel="Close Audience Pulse" accessibilityRole="button" onPress={() => setPollOpen(false)} style={styles.sheetClose}>
                  <X color={visual.color.text} size={19} />
                </Pressable>
              </View>
              {poll ? (
                <>
                  <Text style={[styles.prompt, styles.sheetPrompt]}>{poll.prompt}</Text>
                  <View style={styles.options}>
                    {poll.options.map((option) => (
                      <PollOption key={option.id} poll={poll} option={option} disabled={disabled || busy || !isActive} onVote={onVote} />
                    ))}
                  </View>
                  <View style={styles.pollFooter}>
                    <Text style={styles.responseCount}>{poll.totalVotes} {poll.totalVotes === 1 ? 'response' : 'responses'} · No names shared</Text>
                    {pulse.canManage && isActive ? (
                      <Pressable disabled={busy} onPress={() => void onClose(poll.id)}><Text style={styles.closePoll}>Close poll</Text></Pressable>
                    ) : null}
                  </View>
                  {canOpen ? (
                    <Pressable onPress={() => { setPollOpen(false); setPickerOpen(true); }} style={styles.nextQuestion}>
                      <Text style={styles.nextQuestionText}>Ask another safe question</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal animationType="fade" transparent visible={pickerOpen} onRequestClose={() => setPickerOpen(false)}>
          <Pressable onPress={() => setPickerOpen(false)} style={styles.modalBackdrop}>
            <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View><Text style={styles.sheetEyebrow}>AUDIENCE PULSE</Text><Text style={styles.sheetTitle}>Shape the conversation.</Text></View>
                <Pressable accessibilityLabel="Close question picker" accessibilityRole="button" onPress={() => setPickerOpen(false)} style={styles.sheetClose}><X color={visual.color.text} size={19} /></Pressable>
              </View>
              <Text style={styles.sheetBody}>Choose a thoughtful prompt. The room can guide the conversation, never a romantic decision.</Text>
              <View style={styles.templateList}>
                {pulse.templates.map((template) => <TemplateRow key={template.templateKey} template={template} disabled={busy} onChoose={chooseTemplate} />)}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <BarChart3 color={visual.color.teal} size={14} />
            <Text style={styles.eyebrow}>AUDIENCE PULSE</Text>
          </View>
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>

        {poll ? (
          <>
            <Text style={styles.prompt}>{poll.prompt}</Text>
            <View style={styles.options}>
              {poll.options.map((option) => (
                <PollOption
                  key={option.id}
                  poll={poll}
                  option={option}
                  disabled={disabled || busy || !isActive}
                  onVote={onVote}
                />
              ))}
            </View>
            <View style={styles.pollFooter}>
              <Text style={styles.responseCount}>
                {poll.totalVotes} {poll.totalVotes === 1 ? 'response' : 'responses'} · No names shared
              </Text>
              {pulse.canManage && isActive ? (
                <Pressable disabled={busy} hitSlop={8} onPress={() => void onClose(poll.id)}>
                  <Text style={styles.closePoll}>Close poll</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={disabled || busy}
            onPress={() => setPickerOpen(true)}
            style={styles.askButton}
          >
            <MessageCircleQuestion color={visual.color.accentContrast} size={17} />
            <Text style={styles.askButtonText}>Ask the room</Text>
          </Pressable>
        )}

        {canOpen && poll ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled || busy}
            onPress={() => setPickerOpen(true)}
            style={styles.nextQuestion}
          >
            <Text style={styles.nextQuestionText}>Ask another safe question</Text>
          </Pressable>
        ) : null}
        {busy ? <ActivityIndicator color={visual.color.teal} size="small" style={styles.busy} /> : null}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
        transparent
        visible={pickerOpen}
      >
        <Pressable onPress={() => setPickerOpen(false)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>AUDIENCE PULSE</Text>
                <Text style={styles.sheetTitle}>Shape the conversation.</Text>
              </View>
              <Pressable
                accessibilityLabel="Close question picker"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setPickerOpen(false)}
                style={styles.sheetClose}
              >
                <X color={visual.color.text} size={19} />
              </Pressable>
            </View>
            <Text style={styles.sheetBody}>
              Choose a thoughtful prompt. The room can guide the conversation, never a romantic decision.
            </Text>
            <View style={styles.templateList}>
              {pulse.templates.map((template) => (
                <TemplateRow
                  key={template.templateKey}
                  template={template}
                  disabled={busy}
                  onChoose={chooseTemplate}
                />
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  trigger: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.borderStrong },
  triggerResponseCount: { marginTop: 11 },
  compactCard: { marginTop: 8, marginBottom: 3, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surfaceTranslucent, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  compactCopy: { flex: 1, gap: 2 },
  compactPrompt: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  card: { marginTop: 10, marginBottom: 4, borderRadius: 18, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surfaceTranslucent, padding: 13, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  status: { color: visual.color.teal, fontSize: 8, letterSpacing: 0.8, fontFamily: 'Manrope_800ExtraBold' },
  prompt: { color: visual.color.text, fontSize: 14, lineHeight: 19, fontFamily: 'Manrope_700Bold' },
  options: { gap: 7, marginTop: 10 },
  option: { minHeight: 39, borderRadius: 12, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  optionSelected: { borderColor: visual.color.teal, backgroundColor: visual.color.teal },
  optionProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: visual.color.tealSoft },
  optionLabel: { flex: 1, color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_700Bold' },
  optionLabelSelected: { color: visual.color.accentContrast },
  percentage: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  pollFooter: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  responseCount: { flex: 1, color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  closePoll: { color: visual.color.teal, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  askButton: { minHeight: 43, borderRadius: 14, backgroundColor: visual.color.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  askButtonText: { color: visual.color.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  nextQuestion: { alignSelf: 'flex-start', marginTop: 9 },
  nextQuestionText: { color: visual.color.teal, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  busy: { position: 'absolute', right: 12, bottom: 10 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: visual.color.scrim },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surface, paddingHorizontal: 20, paddingTop: 19, paddingBottom: 32 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  sheetEyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.7, fontFamily: 'Manrope_800ExtraBold' },
  sheetTitle: { marginTop: 3, color: visual.color.text, fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  sheetClose: { width: 39, height: 39, borderRadius: 20, backgroundColor: visual.color.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { marginTop: 9, color: visual.color.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
  sheetPrompt: { marginTop: 17 },
  templateList: { marginTop: 16, gap: 9 },
  templateRow: { minHeight: 68, borderRadius: 17, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceRaised, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  templateCopy: { flex: 1 },
  templateKind: { color: visual.color.textMuted, fontSize: 8, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  templatePrompt: { marginTop: 4, color: visual.color.text, fontSize: 12, lineHeight: 17, fontFamily: 'Manrope_700Bold' },
});
