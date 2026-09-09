import { BarChart3, Bot, ChevronLeft, RefreshCw, Share2, Shuffle, Sparkles, UsersRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveAudiencePulseCard, type LiveAudiencePulseCardProps } from './LiveAudiencePulseCard.tsx';
import { LiveHostedMatchingPanel, type LiveHostedMatchingPanelProps } from './LiveHostedMatchingPanel.tsx';
import { LiveQuickConnectHostPanel, type LiveQuickConnectHostPanelProps } from './LiveQuickConnectHostPanel.tsx';
import { LiveStageDesk, type LiveStageDeskProps } from './LiveStageDesk.tsx';
import { OdoCopilotPanel } from './OdoCopilotPanel.tsx';
import { OdoAutopilotPanel } from './OdoAutopilotPanel.tsx';
import { OdoFullQuickConnectPanel } from './OdoFullQuickConnectPanel.tsx';
import { OdoShowDirectorPanel } from './OdoShowDirectorPanel.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';
import { useLiveOdoCopilot } from '../odo/copilot/use-live-odo-copilot.ts';
import { useLiveOdoAutopilot } from '../odo/autopilot/use-live-odo-autopilot.ts';
import { useLiveOdoFullQuickConnect } from '../odo/full-quick-connect/use-live-odo-full-quick-connect.ts';
import { useLiveOdoShowDirector } from '../odo/show/use-live-odo-show-director.ts';

type LiveStudioTab = 'rotation' | 'stage' | 'match' | 'pulse' | 'odo' | 'invite';

export type LiveStudioModalProps = {
  visible: boolean;
  onClose: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  sessionId: string;
  roomTitle: string;
  stageDeskProps: Omit<LiveStageDeskProps, 'expanded' | 'onExpandedChange' | 'presentation'>;
  quickConnectProps?: LiveQuickConnectHostPanelProps | null;
  matchingProps?: LiveHostedMatchingPanelProps | null;
  pulseProps: LiveAudiencePulseCardProps;
  odoRoundId?: string | null;
  odoAutopilotOperational?: boolean;
  onOdoSuggestionUsed?: () => void | Promise<void>;
};

const TAB_META: Record<LiveStudioTab, { label: string; icon: LucideIcon }> = {
  stage: { label: 'Stage', icon: UsersRound },
  rotation: { label: 'Rotation', icon: Shuffle },
  match: { label: 'Match', icon: Sparkles },
  pulse: { label: 'Pulse', icon: BarChart3 },
  odo: { label: 'Odo', icon: Bot },
  invite: { label: 'Invite', icon: Share2 },
};

export function LiveStudioModal({
  visible,
  onClose,
  refreshing,
  onRefresh,
  sessionId,
  roomTitle,
  stageDeskProps,
  quickConnectProps = null,
  matchingProps = null,
  pulseProps,
  odoRoundId = null,
  odoAutopilotOperational = false,
  onOdoSuggestionUsed,
}: LiveStudioModalProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0);
  const bottomInset = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);
  const hasQuickConnectControls = quickConnectProps != null;
  const hasMatchingControls = matchingProps != null;
  const odo = useLiveOdoCopilot({
    enabled: visible,
    sessionId,
    roundId: odoRoundId,
    onUsed: onOdoSuggestionUsed,
  });
  const hasOdoCopilot = odo.state?.enabled === true;
  const showDirector = useLiveOdoShowDirector({
    enabled: odoAutopilotOperational,
    sessionId,
  });
  const hasShowDirector = showDirector.state?.available === true
    || showDirector.state?.enabled === true;
  const fullQuickConnect = useLiveOdoFullQuickConnect({
    enabled: odoAutopilotOperational && hasQuickConnectControls,
    sessionId,
  });
  const hasFullQuickConnect = fullQuickConnect.state != null
    && (fullQuickConnect.state.available
      || fullQuickConnect.state.lifecycleState !== 'off');
  const autopilot = useLiveOdoAutopilot({
    enabled: odoAutopilotOperational && !hasFullQuickConnect,
    sessionId,
  });
  const hasOdoAutopilot = autopilot.state?.available === true
    || autopilot.state?.enabled === true;
  const hasOdo = hasOdoCopilot || hasOdoAutopilot || hasFullQuickConnect
    || hasShowDirector;
  const tabs = useMemo<readonly LiveStudioTab[]>(
    () => hasQuickConnectControls
      ? ['rotation', 'stage', 'pulse', ...(hasOdo ? ['odo' as const] : []), 'invite']
      : hasMatchingControls
        ? ['stage', 'match', 'pulse', ...(hasOdo ? ['odo' as const] : []), 'invite']
        : ['stage', 'pulse', ...(hasOdo ? ['odo' as const] : []), 'invite'],
    [hasMatchingControls, hasOdo, hasQuickConnectControls],
  );
  const [selectedTab, setSelectedTab] = useState<LiveStudioTab>('stage');
  const activeTab = tabs.includes(selectedTab) ? selectedTab : tabs[0];
  const studioRefreshing = refreshing || odo.loading || autopilot.loading
    || fullQuickConnect.loading || showDirector.loading;

  useEffect(() => {
    if (visible && hasQuickConnectControls) setSelectedTab('rotation');
  }, [hasQuickConnectControls, visible]);

  const shareRoom = async () => {
    const deepLink = `betweenerapp://live/${sessionId}`;
    const webLink = `https://getbetweener.com/live/${sessionId}`;
    await Share.share({
      title: `Join ${roomTitle} on Betweener`,
      message: `Join ${roomTitle} on Betweener Live.\n${webLink}\n${deepLink}`,
      url: webLink,
    }).catch(() => undefined);
  };

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent={false}
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      visible={visible}
    >
      <View style={[styles.root, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close Live Studio" accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.iconButton}>
            <ChevronLeft color={visual.color.text} size={24} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>PRIVATE HOST CONSOLE</Text>
            <Text style={styles.title}>Live Studio</Text>
          </View>
          <Pressable
            accessibilityLabel="Refresh Live Studio"
            accessibilityRole="button"
            disabled={studioRefreshing}
            onPress={() => {
              onRefresh();
              void odo.refresh();
              void autopilot.refresh();
              void fullQuickConnect.refresh();
              void showDirector.refresh();
            }}
            style={styles.iconButton}
          >
            {studioRefreshing ? <ActivityIndicator color={visual.color.teal} size="small" /> : <RefreshCw color={visual.color.teal} size={19} />}
          </Pressable>
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {tabs.map((tab) => {
            const Icon = TAB_META[tab].icon;
            const selected = activeTab === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setSelectedTab(tab)}
                style={[styles.tab, selected && styles.tabSelected, selected && tab === 'odo' && styles.odoTabSelected]}
              >
                <Icon color={selected ? visual.color.accentContrast : visual.color.textMuted} size={15} />
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{TAB_META[tab].label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          key={activeTab}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'rotation' && quickConnectProps ? (
            <>
              <Text style={styles.sectionTitle}>Guide the rotation.</Text>
              <Text style={styles.sectionBody}>Open pairing when the room is ready, protect active conversations, and finish without exposing anyone&apos;s private choices.</Text>
              <LiveQuickConnectHostPanel {...quickConnectProps} />
            </>
          ) : null}

          {activeTab === 'stage' ? (
            <>
              <Text style={styles.sectionTitle}>Shape the public stage.</Text>
              <Text style={styles.sectionBody}>Invite thoughtfully, move guests back to the audience, and protect the room without covering the conversation.</Text>
              <LiveStageDesk {...stageDeskProps} expanded onExpandedChange={() => undefined} presentation="studio" />
            </>
          ) : null}

          {activeTab === 'match' && matchingProps ? (
            <>
              <Text style={styles.sectionTitle}>Warm introductions, with consent.</Text>
              <Text style={styles.sectionBody}>Every proposal remains private until both people independently agree.</Text>
              <LiveHostedMatchingPanel {...matchingProps} />
            </>
          ) : null}

          {activeTab === 'pulse' ? (
            <>
              <Text style={styles.sectionTitle}>Guide the room, gently.</Text>
              <Text style={styles.sectionBody}>Open a safe prompt, watch the room respond, then close it when the conversation has enough direction.</Text>
              <LiveAudiencePulseCard {...pulseProps} presentation="studio" />
            </>
          ) : null}

          {activeTab === 'odo' && hasOdo ? (
            <>
              <Text style={styles.sectionTitle}>Thoughtful direction, under your control.</Text>
              <Text style={styles.sectionBody}>{hasShowDirector
                ? 'Let Odo pace the public programme while Quick Connect, consent, Safety, and every private choice keep their existing authority.'
                : hasFullQuickConnect
                ? 'Let Odo pace the full Quick Connect rotation while consent, safety, eligibility, and private choices stay under Betweener control.'
                : 'Let Odo handle selected presentation moments, or keep asking for one private suggestion at a time.'}</Text>
              {hasShowDirector ? <OdoShowDirectorPanel controller={showDirector} /> : null}
              {hasFullQuickConnect
                ? <OdoFullQuickConnectPanel controller={fullQuickConnect} />
                : <OdoAutopilotPanel controller={autopilot} />}
              {hasOdoCopilot ? <OdoCopilotPanel controller={odo} /> : null}
            </>
          ) : null}

          {activeTab === 'invite' ? (
            <View style={styles.inviteCard}>
              <View style={styles.inviteIcon}><Share2 color={visual.color.teal} size={24} /></View>
              <Text style={styles.inviteTitle}>Bring the right people in.</Text>
              <Text style={styles.inviteBody}>Share a direct route to {roomTitle}. Admission and room permissions still remain server-controlled.</Text>
              <Pressable accessibilityRole="button" onPress={() => void shareRoom()} style={styles.shareButton}>
                <Share2 color={visual.color.accentContrast} size={17} />
                <Text style={styles.shareButtonText}>Share invitation</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: visual.color.canvas },
  header: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: visual.color.border, backgroundColor: visual.color.surface },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  headerCopy: { flex: 1, alignItems: 'center' },
  eyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 2, color: visual.color.text, fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  tabs: { marginHorizontal: 16, marginTop: 14, padding: 4, borderRadius: 19, flexDirection: 'row', backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.border },
  tab: { flex: 1, minHeight: 39, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabSelected: { backgroundColor: visual.color.teal },
  odoTabSelected: { backgroundColor: visual.color.purple },
  tabText: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  tabTextSelected: { color: visual.color.accentContrast },
  content: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 40 },
  sectionTitle: { color: visual.color.text, fontSize: 23, fontFamily: 'PlayfairDisplay_700Bold' },
  sectionBody: { marginTop: 7, marginBottom: 18, color: visual.color.textMuted, fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  inviteCard: { borderRadius: 24, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surfaceRaised, padding: 22 },
  inviteIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.tealSoft },
  inviteTitle: { marginTop: 18, color: visual.color.text, fontSize: 23, fontFamily: 'PlayfairDisplay_700Bold' },
  inviteBody: { marginTop: 8, color: visual.color.textMuted, fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  shareButton: { marginTop: 22, minHeight: 48, borderRadius: 24, backgroundColor: visual.color.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareButtonText: { color: visual.color.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
});
