import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AUTH_PALETTE } from '@/components/auth/AuthScreenFrame';

type AuthBottomSheetProps = PropsWithChildren<{
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
}>;

export function AuthBottomSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: AuthBottomSheetProps) {
  const { height } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="Close sign-in options"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="close" size={20} color={AUTH_PALETTE.ink} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.optionsContent}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: Math.max(260, height * 0.66) }}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(13,25,25,0.48)',
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#FBF7F2',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    elevation: 14,
  },
  handle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    marginBottom: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(95,112,108,0.28)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  headerCopy: { flex: 1 },
  title: {
    color: AUTH_PALETTE.ink,
    fontFamily: 'Archivo_700Bold',
    fontSize: 21,
  },
  subtitle: {
    marginTop: 5,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: 'rgba(31,42,42,0.06)',
  },
  pressed: { opacity: 0.62 },
  optionsContent: { paddingBottom: 4 },
});
