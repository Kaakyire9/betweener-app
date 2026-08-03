import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatVideoViewer } from './ChatVideoViewer';

type ChatImmersiveVideoViewerProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

export const ChatImmersiveVideoViewer = ({
  visible,
  uri,
  onClose,
}: ChatImmersiveVideoViewerProps) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {uri ? (
          <ChatVideoViewer
            url={uri}
            visible={visible}
            styles={styles}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.76)', 'transparent', 'rgba(0,0,0,0.48)']}
          locations={[0, 0.28, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.header, { top: Math.max(insets.top + 10, 18) }]}>
          <View>
            <Text style={styles.eyebrow}>Shared video</Text>
            <Text style={styles.title}>Video</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close video"
            hitSlop={10}
            onPress={onClose}
            style={styles.closeButton}
          >
            <MaterialCommunityIcons name="close" size={25} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  videoViewer: { width: '100%', height: '100%' },
  header: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 2 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,9,13,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
});
