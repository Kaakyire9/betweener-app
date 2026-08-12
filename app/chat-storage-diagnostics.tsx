import { useAuth } from '@/lib/auth-context';
import { getChatBootCacheSnapshot } from '@/lib/chat/local/chat-boot-cache';
import { ChatRepository, type ChatStorageDiagnosticsSnapshot } from '@/lib/chat/local/chat-repository';
import {
  getChatMediaDownloadPolicy,
  type ChatMediaDownloadPolicy,
} from '@/lib/chat/media/chat-media-download-policy';
import { canAccessInternalTools } from '@/lib/internal-tools';
import { getOfflineAttachmentUsage } from '@/lib/offline/attachment-file-store';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type BootSnapshot = ReturnType<typeof getChatBootCacheSnapshot>;
type AttachmentUsage = Awaited<ReturnType<typeof getOfflineAttachmentUsage>>;

const formatValue = (value: unknown) => {
  if (value == null) return 'null';
  if (typeof value === 'string') return value || "''";
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

const formatTime = (value: string | number | null | undefined) => {
  if (value == null) return 'null';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
};

export default function ChatStorageDiagnosticsScreen() {
  const internalToolsEnabled = canAccessInternalTools();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ChatStorageDiagnosticsSnapshot | null>(null);
  const [bootSnapshot, setBootSnapshot] = useState<BootSnapshot | null>(null);
  const [attachmentUsage, setAttachmentUsage] = useState<AttachmentUsage | null>(null);
  const [downloadPolicy, setDownloadPolicy] = useState<ChatMediaDownloadPolicy | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const goBackSafe = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/diagnostics');
  };

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setCopyStatus(null);
    try {
      const [dbSnapshot, nextAttachmentUsage, nextDownloadPolicy] = await Promise.all([
        ChatRepository.getStorageDiagnostics(user?.id ?? null),
        getOfflineAttachmentUsage(),
        getChatMediaDownloadPolicy(),
      ]);
      setSnapshot(dbSnapshot);
      setAttachmentUsage(nextAttachmentUsage);
      setDownloadPolicy(nextDownloadPolicy);
      setBootSnapshot(getChatBootCacheSnapshot(user?.id ?? null));
    } catch (nextError) {
      setError(String((nextError as { message?: unknown })?.message ?? nextError ?? 'chat_storage_diagnostics_failed'));
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  const copyDiagnosticsJson = useCallback(async () => {
    if (!snapshot || !bootSnapshot) {
      setCopyStatus('Nothing to copy yet.');
      return;
    }
    try {
      const payload = JSON.stringify(
        {
          copiedAt: new Date().toISOString(),
          currentUserId: user?.id ?? null,
          sqlite: snapshot,
          bootCache: bootSnapshot,
          attachmentCache: attachmentUsage,
          mediaDownloadPolicy: downloadPolicy,
        },
        null,
        2,
      );
      await Clipboard.setStringAsync(payload);
      setCopyStatus(`Copied ${payload.length} chars`);
    } catch (nextError) {
      setCopyStatus(
        `Copy failed: ${String((nextError as { message?: unknown })?.message ?? nextError ?? 'unknown_error')}`,
      );
    }
  }, [attachmentUsage, bootSnapshot, downloadPolicy, snapshot, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!internalToolsEnabled) {
    return <Redirect href="/(tabs)/vibes" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat Storage</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={copyDiagnosticsJson} disabled={refreshing}>
            <Text style={styles.headerButtonText}>Copy JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={load} disabled={refreshing}>
            <Text style={styles.headerButtonText}>{refreshing ? 'Loading' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      >
        <View style={styles.card}>
          <Text style={styles.h2}>Verification</Text>
          <Text style={styles.row}>SQLite is working if these counts stay non-zero across app restart/offline.</Text>
          <Text style={styles.row}>Pending outbox rows should survive restart until they are sent or failed.</Text>
          <Text style={styles.row}>Boot hints should reflect the last local-first chat activity.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Scope</Text>
          <Text style={styles.row}>currentUserId: {user?.id ?? 'null'}</Text>
          <Text style={styles.row}>snapshotOwnerUserId: {snapshot?.ownerUserId ?? 'null'}</Text>
          <Text style={styles.row}>generatedAt: {formatTime(snapshot?.generatedAt)}</Text>
          {copyStatus ? <Text style={styles.copyStatus}>copy: {copyStatus}</Text> : null}
          {error ? <Text style={styles.error}>error: {error}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Database</Text>
          <Text style={styles.row}>dbName: {snapshot?.dbName ?? 'null'}</Text>
          <Text style={styles.row}>targetSchemaVersion: {snapshot?.targetSchemaVersion ?? 'null'}</Text>
          <Text style={styles.row}>actualSchemaVersion: {snapshot?.actualSchemaVersion ?? 'null'}</Text>
          <Text style={styles.row}>threads: {snapshot?.counts.threads ?? 'null'}</Text>
          <Text style={styles.row}>participants: {snapshot?.counts.participants ?? 'null'}</Text>
          <Text style={styles.row}>messages: {snapshot?.counts.messages ?? 'null'}</Text>
          <Text style={styles.row}>media: {snapshot?.counts.media ?? 'null'}</Text>
          <Text style={styles.row}>readStates: {snapshot?.counts.readStates ?? 'null'}</Text>
          <Text style={styles.row}>pendingOutbox: {snapshot?.counts.pendingOutbox ?? 'null'}</Text>
          <Text style={styles.row}>syncStates: {snapshot?.counts.syncStates ?? 'null'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Boot Cache</Text>
          <Text style={styles.row}>lastOpenedThreadId: {bootSnapshot?.lastOpenedThreadId ?? 'null'}</Text>
          <Text style={styles.row}>lastThreadListPaintAt: {formatTime(bootSnapshot?.lastThreadListPaintAt)}</Text>
          <Text style={styles.row}>lastSuccessfulSyncAt: {formatTime(bootSnapshot?.lastSuccessfulSyncAt)}</Text>
          <Text style={styles.row}>lastKnownUserId: {bootSnapshot?.lastKnownUserId ?? 'null'}</Text>
          <Text style={styles.row}>hasLocalChatData: {formatValue(bootSnapshot?.hasLocalChatData)}</Text>
          <Text style={styles.row}>offlineModeHint: {formatValue(bootSnapshot?.offlineModeHint)}</Text>
          <Text style={styles.row}>lastSyncCursorGlobal: {bootSnapshot?.lastSyncCursorGlobal ?? 'null'}</Text>
          <Text style={styles.row}>asyncSnapshotMigratedV1: {formatValue(bootSnapshot?.asyncSnapshotMigratedV1)}</Text>
          <Text style={styles.row}>chatKeys: {(bootSnapshot?.allChatKeys.length ?? 0).toString()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Offline Attachments</Text>
          <Text style={styles.row}>entries: {attachmentUsage?.entries ?? 'null'}</Text>
          <Text style={styles.row}>bytes: {attachmentUsage?.bytes ?? 'null'}</Text>
          <Text style={styles.row}>voice notes: {attachmentUsage?.audioEntries ?? 'null'}</Text>
          <Text style={styles.row}>documents: {attachmentUsage?.documentEntries ?? 'null'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Media Download Policy</Text>
          <Text style={styles.row}>photos: {downloadPolicy?.photo ?? 'null'}</Text>
          <Text style={styles.row}>videos: {downloadPolicy?.video ?? 'null'}</Text>
          <Text style={styles.row}>voice notes: {downloadPolicy?.audio ?? 'null'}</Text>
          <Text style={styles.row}>documents: {downloadPolicy?.document ?? 'null'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Message Status Counts</Text>
          {(snapshot?.messageStatusCounts.length ?? 0) === 0 ? (
            <Text style={styles.row}>No rows.</Text>
          ) : (
            snapshot?.messageStatusCounts.map((row) => (
              <Text key={`message-status-${row.status}`} style={styles.row}>
                {row.status}: {row.count}
              </Text>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Outbox Status Counts</Text>
          {(snapshot?.outboxStatusCounts.length ?? 0) === 0 ? (
            <Text style={styles.row}>No rows.</Text>
          ) : (
            snapshot?.outboxStatusCounts.map((row) => (
              <Text key={`outbox-status-${row.status}`} style={styles.row}>
                {row.status}: {row.count}
              </Text>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Recent Threads</Text>
          {(snapshot?.recentThreads.length ?? 0) === 0 ? (
            <Text style={styles.row}>No rows.</Text>
          ) : (
            snapshot?.recentThreads.map((thread) => (
              <View key={`thread-${thread.id}`} style={styles.block}>
                <Text style={styles.row}>id: {thread.id}</Text>
                <Text style={styles.row}>peerUserId: {thread.peer_user_id ?? 'null'}</Text>
                <Text style={styles.row}>peerProfileId: {thread.peer_profile_id ?? 'null'}</Text>
                <Text style={styles.row}>peerName: {thread.peer_name ?? 'null'}</Text>
                <Text style={styles.row}>lastMessageAt: {formatTime(thread.last_message_at)}</Text>
                <Text style={styles.row}>preview: {thread.last_message_preview ?? 'null'}</Text>
                <Text style={styles.row}>unread: {thread.unread_count}</Text>
                <Text style={styles.row}>pinned: {thread.is_pinned}</Text>
                <Text style={styles.row}>archived: {thread.is_archived}</Text>
                <Text style={styles.row}>localStatus: {thread.local_status}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Pending Outbox Rows</Text>
          {(snapshot?.pendingOutboxItems.length ?? 0) === 0 ? (
            <Text style={styles.row}>No rows.</Text>
          ) : (
            snapshot?.pendingOutboxItems.map((item) => (
              <View key={`outbox-${item.id}`} style={styles.block}>
                <Text style={styles.row}>id: {item.id}</Text>
                <Text style={styles.row}>localMessageId: {item.local_message_id}</Text>
                <Text style={styles.row}>threadId: {item.thread_id}</Text>
                <Text style={styles.row}>status: {item.status}</Text>
                <Text style={styles.row}>attemptCount: {item.attempt_count}</Text>
                <Text style={styles.row}>nextRetryAt: {formatTime(item.next_retry_at)}</Text>
                <Text style={styles.row}>errorCode: {item.error_code ?? 'null'}</Text>
                <Text style={styles.row}>updatedAt: {formatTime(item.updated_at)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Sync State Rows</Text>
          {(snapshot?.syncStates.length ?? 0) === 0 ? (
            <Text style={styles.row}>No rows.</Text>
          ) : (
            snapshot?.syncStates.map((state) => (
              <View key={`sync-${state.id}`} style={styles.block}>
                <Text style={styles.row}>id: {state.id}</Text>
                <Text style={styles.row}>scope: {state.scope}</Text>
                <Text style={styles.row}>threadId: {state.thread_id ?? 'null'}</Text>
                <Text style={styles.row}>lastCursor: {state.last_cursor ?? 'null'}</Text>
                <Text style={styles.row}>lastSyncedAt: {formatTime(state.last_synced_at)}</Text>
                <Text style={styles.row}>lastError: {state.last_error ?? 'null'}</Text>
                <Text style={styles.row}>updatedAt: {formatTime(state.updated_at)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  backText: {
    color: '#0b6b69',
    fontWeight: '600',
  },
  refreshButton: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#0b6b69',
  },
  headerButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    padding: 14,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e7e7e7',
  },
  h2: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  row: {
    fontSize: 13,
    color: '#222',
    marginBottom: 4,
  },
  block: {
    borderTopWidth: 1,
    borderTopColor: '#efefef',
    paddingTop: 8,
    marginTop: 8,
  },
  error: {
    fontSize: 13,
    color: '#b00020',
    marginTop: 6,
  },
  copyStatus: {
    fontSize: 13,
    color: '#0b6b69',
    marginTop: 6,
  },
});
