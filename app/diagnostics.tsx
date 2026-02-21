import { useAuth } from '@/lib/auth-context';
import { ensureFreshSession, getSupabaseNetEvents, getSupabaseConfigStatus, supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken } from '@/lib/notifications/push';

type HealthResult = {
  at: number;
  ok: boolean;
  ms: number;
  status: number | null;
  error: string | null;
};

const formatAt = (at: number) => {
  try {
    return new Date(at).toISOString();
  } catch {
    return String(at);
  }
};

export default function DiagnosticsScreen() {
  const { user, session } = useAuth();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [running, setRunning] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>('');

  const config = useMemo(() => getSupabaseConfigStatus(), []);
  const net = useMemo(() => getSupabaseNetEvents().slice().reverse(), [health?.at]);

  const goBackSafe = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/(tabs)/explore');
  };

  const runHealthCheck = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      const startedAt = Date.now();

      // Best-effort: refresh session if it is stale/expired.
      await Promise.race([ensureFreshSession(), new Promise((resolve) => setTimeout(resolve, 8000))]);

      // Minimal data request to confirm the app can reach Supabase.
      // Note: RLS can still reject this, which is useful signal (401/403 vs timeout).
      const res = await supabase.from('profiles').select('id').limit(1);

      const ms = Date.now() - startedAt;
      setHealth({
        at: Date.now(),
        ok: !res.error,
        ms,
        status: (res as any)?.status ?? (res.error ? ((res.error as any)?.status ?? null) : 200),
        error: res.error ? String((res.error as any)?.message || res.error) : null,
      });
    } catch (e) {
      const at = Date.now();
      setHealth({
        at,
        ok: false,
        ms: 0,
        status: null,
        error: String((e as any)?.message || e || 'health_check_failed'),
      });
    } finally {
      setRunning(false);
    }
  }, [running]);

  const runPushCheck = useCallback(async () => {
    if (!user?.id) {
      setPushStatus('no user');
      return;
    }
    try {
      setPushStatus('checking...');
      const perms = await Notifications.getPermissionsAsync();
      const projectId =
        (Constants as any).easConfig?.projectId ||
        (Constants as any).expoConfig?.extra?.eas?.projectId ||
        (Constants as any).expoConfig?.extra?.projectId ||
        null;
      const permStatus = (perms as any)?.status ?? ((perms as any)?.granted ? 'granted' : 'denied');
      setPushStatus(`perm=${String(permStatus)} projectId=${projectId ? 'ok' : 'missing'}`);

      await registerPushToken(user.id);
      setPushStatus((prev) => `${prev} | register invoked`);
    } catch (e) {
      setPushStatus(`error: ${String((e as any)?.message || e || 'push_check_failed')}`);
    }
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Diagnostics</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.h2}>Supabase Config</Text>
          <Text style={styles.row}>configured: {String(config.configured)}</Text>
          <Text style={styles.row}>urlPresent: {String(config.urlPresent)}</Text>
          <Text style={styles.row}>keyPresent: {String(config.keyPresent)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Auth</Text>
          <Text style={styles.row}>hasSession: {String(!!session)}</Text>
          <Text style={styles.row}>userId: {user?.id ?? 'null'}</Text>
          <Text style={styles.row}>expiresAt: {(session as any)?.expires_at ?? 'unknown'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Health Check</Text>
          <TouchableOpacity style={[styles.button, running ? styles.buttonDisabled : null]} onPress={runHealthCheck}>
            <Text style={styles.buttonText}>{running ? 'Running...' : 'Run Health Check'}</Text>
          </TouchableOpacity>
          {health ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.row}>at: {formatAt(health.at)}</Text>
              <Text style={styles.row}>ok: {String(health.ok)}</Text>
              <Text style={styles.row}>ms: {String(health.ms)}</Text>
              <Text style={styles.row}>status: {health.status == null ? 'null' : String(health.status)}</Text>
              <Text style={styles.row}>error: {health.error ?? 'null'}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Push (Expo)</Text>
          <TouchableOpacity style={styles.button} onPress={runPushCheck}>
            <Text style={styles.buttonText}>Check / Register Push</Text>
          </TouchableOpacity>
          <Text style={[styles.row, { marginTop: 10 }]}>{pushStatus || '—'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Recent Supabase Net Events</Text>
          <Text style={styles.small}>
            newest first; status=599 is synthetic (see code). status=598 is client timeout (pre-fetch hang guard).
          </Text>
          {net.length === 0 ? (
            <Text style={styles.row}>No events recorded yet.</Text>
          ) : (
            net.slice(0, 40).map((e, idx) => (
              <View key={`${e.at}_${idx}`} style={styles.eventRow}>
                <Text style={styles.eventText}>
                  {new Date(e.at).toLocaleTimeString()} {e.method} {e.status} {e.ms}ms {e.code ? `code=${e.code}` : ''}
                  {e.via ? ` via=${e.via}` : ''}
                </Text>
                <Text style={styles.eventPath}>{e.path}</Text>
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
  placeholder: {
    width: 48,
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
  small: {
    fontSize: 12,
    color: '#555',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#0b6b69',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  eventRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#efefef',
  },
  eventText: {
    fontSize: 12,
    color: '#111',
  },
  eventPath: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
});
