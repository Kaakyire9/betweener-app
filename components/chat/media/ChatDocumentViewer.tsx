import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

type ChatDocumentViewerProps = {
  visible: boolean;
  uri: string | null;
  title: string;
  readAccessRoot?: string;
  onClose: () => void;
};

export const ChatDocumentViewer = ({
  visible,
  uri,
  title,
  readAccessRoot,
  onClose,
}: ChatDocumentViewerProps) => {
  const insets = useSafeAreaInsets();
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!visible || !uri) return;
    setLoadFailed(false);
    setRetryKey(0);
  }, [uri, visible]);

  return (
    <Modal
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>Document</Text>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close document"
            hitSlop={10}
            onPress={onClose}
            style={styles.closeButton}
          >
            <MaterialCommunityIcons name="close" size={23} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.viewerSurface}>
          {uri && !loadFailed ? (
            <WebView
              key={`${uri}:${retryKey}`}
              source={{ uri }}
              style={styles.webView}
              originWhitelist={['file://*', 'content://*', 'https://*', 'http://*']}
              allowFileAccess
              allowingReadAccessToURL={readAccessRoot}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.loading}>
                  <ActivityIndicator color="#8B5CF6" size="large" />
                  <Text style={styles.loadingText}>Opening document…</Text>
                </View>
              )}
              onError={() => setLoadFailed(true)}
              onHttpError={() => setLoadFailed(true)}
            />
          ) : (
            <View style={styles.errorState}>
              <View style={styles.errorIcon}>
                <MaterialCommunityIcons name="file-alert-outline" size={30} color="#C4B5FD" />
              </View>
              <Text style={styles.errorTitle}>Document could not be displayed</Text>
              <Text style={styles.errorBody}>The local copy may be incomplete. Try opening it again.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setLoadFailed(false);
                  setRetryKey((current) => current + 1);
                }}
                style={styles.retryButton}
              >
                <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05090D' },
  header: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#081015',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  titleWrap: { flex: 1, gap: 2 },
  eyebrow: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  viewerSurface: { flex: 1, backgroundColor: '#F2F2F2' },
  webView: { flex: 1, backgroundColor: '#F2F2F2' },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F2F2F2',
  },
  loadingText: { color: '#4B5563', fontSize: 14, fontWeight: '600' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  errorIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#221A37',
    marginBottom: 18,
  },
  errorTitle: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  errorBody: { color: '#6B7280', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  retryButton: {
    marginTop: 20,
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
