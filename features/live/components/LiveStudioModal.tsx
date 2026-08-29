import { BarChart3, ChevronLeft, RefreshCw, Share2, Shuffle, Sparkles, UsersRound } from 'lucide-react-native';
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

type LiveStudioTab = 'rotation' | 'stage' | 'match' | 'pulse' | 'invite';

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
};

const TAB_META: Record<LiveStudioTab, { label: string; icon: LucideIcon }> = {
  stage: { label: 'Stage', icon: UsersRound },
  rotation: { label: 'Rotation', icon: Shuffle },
  match: { label: 'Match', icon: Sparkles },
  pulse: { label: 'Pulse', icon: BarChart3 },
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
}: LiveStudioModalProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0);
  const bottomInset = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);
  const hasQuickConnectControls = quickConnectProps != null;
  const hasMatchingControls = matchingProps != null;
  const tabs = useMemo<readonly LiveStudioTab[]>(
    () => hasQuickConnectControls
      ? ['rotation', 'stage', 'pulse', 'invite']
      : hasMatchingControls
        ? ['stage', 'match', 'pulse', 'invite']
        : ['stage', 'pulse', 'invite'],
    [hasMatchingControls, hasQuickConnectControls],
  );
  const [selectedTab, setSelectedTab] = useState<LiveStudioTab>('stage');
  const activeTab = tabs.includes(selectedTab) ? selectedTab : tabs[0];

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
            <ChevronLeft color="#FFF7EC" size={24} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>PRIVATE HOST CONSOLE</Text>
            <Text style={styles.title}>Live Studio</Text>
          </View>
          <Pressable accessibilityLabel="Refresh Live Studio" accessibilityRole="button" disabled={refreshing} onPress={onRefresh} style={styles.iconButton}>
            {refreshing ? <ActivityIndicator color="#D7B56D" size="small" /> : <RefreshCw color="#D7B56D" size={19} />}
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
                style={[styles.tab, selected && styles.tabSelected]}
              >
                <Icon color={selected ? '#102522' : '#9DB0AA'} size={15} />
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{TAB_META[tab].label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

          {activeTab === 'invite' ? (
            <View style={styles.inviteCard}>
              <View style={styles.inviteIcon}><Share2 color="#D7B56D" size={24} /></View>
              <Text style={styles.inviteTitle}>Bring the right people in.</Text>
              <Text style={styles.inviteBody}>Share a direct route to {roomTitle}. Admission and room permissions still remain server-controlled.</Text>
              <Pressable accessibilityRole="button" onPress={() => void shareRoom()} style={styles.shareButton}>
                <Share2 color="#102522" size={17} />
                <Text style={styles.shareButtonText}>Share invitation</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071310' },
  header: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#263E38', backgroundColor: '#091714' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#152622', borderWidth: 1, borderColor: '#304640' },
  headerCopy: { flex: 1, alignItems: 'center' },
  eyebrow: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 2, color: '#FFF7EC', fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  tabs: { marginHorizontal: 16, marginTop: 14, padding: 4, borderRadius: 19, flexDirection: 'row', backgroundColor: '#10211E', borderWidth: 1, borderColor: '#29413B' },
  tab: { flex: 1, minHeight: 39, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabSelected: { backgroundColor: '#D7B56D' },
  tabText: { color: '#9DB0AA', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  tabTextSelected: { color: '#102522' },
  content: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 40 },
  sectionTitle: { color: '#FFF7EC', fontSize: 23, fontFamily: 'PlayfairDisplay_700Bold' },
  sectionBody: { marginTop: 7, marginBottom: 18, color: '#9FB1AC', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  inviteCard: { borderRadius: 24, borderWidth: 1, borderColor: '#D7B56D45', backgroundColor: '#102522', padding: 22 },
  inviteIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D1F' },
  inviteTitle: { marginTop: 18, color: '#FFF7EC', fontSize: 23, fontFamily: 'PlayfairDisplay_700Bold' },
  inviteBody: { marginTop: 8, color: '#A9BAB5', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  shareButton: { marginTop: 22, minHeight: 48, borderRadius: 24, backgroundColor: '#D7B56D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareButtonText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
});
