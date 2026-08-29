import { ChevronLeft, Sparkles } from 'lucide-react-native';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LiveHostedMatchingPanel,
  type LiveHostedMatchingPanelProps,
} from './LiveHostedMatchingPanel.tsx';

type Props = LiveHostedMatchingPanelProps & {
  visible: boolean;
  onClose: () => void;
  refreshing: boolean;
  onRefresh: () => void;
};

export function LiveHostedMatchingModal({ visible, onClose, refreshing, onRefresh, ...panelProps }: Props) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0);
  const bottomInset = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent={false}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close Match Desk"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            style={styles.closeButton}
          >
            <ChevronLeft color="#FFF7EC" size={24} />
          </Pressable>
          <View style={styles.headerCopy}>
            <View style={styles.eyebrowRow}>
              <Sparkles color="#D7B56D" size={13} />
              <Text style={styles.eyebrow}>PRIVATE HOST CONSOLE</Text>
            </View>
            <Text style={styles.title}>Match Desk</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#D7B56D"
              colors={['#D7B56D']}
            />
          )}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.promise}>
            Propose one intentional introduction at a time. Every choice stays private until both people agree.
          </Text>
          <LiveHostedMatchingPanel {...panelProps} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071310' },
  header: {
    minHeight: 70,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#263E38',
    backgroundColor: '#091714',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#152622',
    borderWidth: 1,
    borderColor: '#304640',
  },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 2, color: '#FFF7EC', fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  content: { paddingBottom: 32 },
  promise: {
    marginHorizontal: 22,
    marginVertical: 20,
    color: '#AFC0BC',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: 'Manrope_500Medium',
  },
});
