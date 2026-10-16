import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type NotificationLevel = 'all_activity' | 'important_only' | 'muted';

type Preferences = {
  notificationLevel: NotificationLevel;
  liveNotifications: boolean;
  gatheringReminders: boolean;
  discussionActivity: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  notificationLevel: 'important_only',
  liveNotifications: true,
  gatheringReminders: true,
  discussionActivity: true,
};

const LEVELS: readonly { value: NotificationLevel; label: string; support: string }[] = [
  { value: 'all_activity', label: 'All activity', support: 'Live, Gatherings, and Circle discussions.' },
  { value: 'important_only', label: 'Important only', support: 'Live and Gathering reminders without discussion noise.' },
  { value: 'muted', label: 'Muted', support: 'Keep this Circle quiet on this account.' },
];

type Props = {
  visible: boolean;
  circleId: string;
  circleName: string;
  accountId: string | null | undefined;
  onClose: () => void;
};

export default function CircleNotificationPreferencesSheet({
  visible,
  circleId,
  circleName,
  accountId,
  onClose,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !circleId || !accountId) return;
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await (supabase as any)
      .from('circle_member_notification_preferences')
      .select('notification_level,live_notifications,gathering_reminders,discussion_activity')
      .eq('circle_id', circleId)
      .eq('user_id', accountId)
      .maybeSingle();
    if (loadError) {
      setError('Notification settings could not be loaded.');
    } else if (data) {
      setPreferences({
        notificationLevel: data.notification_level as NotificationLevel,
        liveNotifications: data.live_notifications !== false,
        gatheringReminders: data.gathering_reminders !== false,
        discussionActivity: data.discussion_activity !== false,
      });
    } else {
      setPreferences(DEFAULT_PREFERENCES);
    }
    setLoading(false);
  }, [accountId, circleId, visible]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!circleId || !accountId || saving) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await (supabase as any)
      .from('circle_member_notification_preferences')
      .upsert({
        circle_id: circleId,
        user_id: accountId,
        notification_level: preferences.notificationLevel,
        live_notifications: preferences.liveNotifications,
        gathering_reminders: preferences.gatheringReminders,
        discussion_activity: preferences.discussionActivity,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'circle_id,user_id' });
    setSaving(false);
    if (saveError) {
      setError('Notification settings could not be saved.');
      return;
    }
    onClose();
  }, [accountId, circleId, onClose, preferences, saving]);

  const muted = preferences.notificationLevel === 'muted';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Circle notifications</Text>
              <Text style={styles.body}>Choose what you hear from {circleName}.</Text>
            </View>
            <TouchableOpacity accessibilityLabel="Close notification settings" style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.tint} />
          ) : (
            <>
              <View style={styles.levelStack}>
                {LEVELS.map((level) => {
                  const selected = preferences.notificationLevel === level.value;
                  return (
                    <Pressable
                      key={level.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      style={[styles.levelCard, selected && styles.levelCardSelected]}
                      onPress={() => setPreferences((current) => ({ ...current, notificationLevel: level.value }))}
                    >
                      <MaterialCommunityIcons
                        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                        size={20}
                        color={selected ? theme.tint : theme.textMuted}
                      />
                      <View style={styles.levelCopy}>
                        <Text style={styles.levelLabel}>{level.label}</Text>
                        <Text style={styles.levelSupport}>{level.support}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.toggleStack, muted && styles.disabledSection]}>
                <PreferenceToggle
                  label="Circle Live"
                  value={preferences.liveNotifications}
                  disabled={muted}
                  onValueChange={(value) => setPreferences((current) => ({ ...current, liveNotifications: value }))}
                  theme={theme}
                  styles={styles}
                />
                <PreferenceToggle
                  label="Gathering reminders"
                  value={preferences.gatheringReminders}
                  disabled={muted}
                  onValueChange={(value) => setPreferences((current) => ({ ...current, gatheringReminders: value }))}
                  theme={theme}
                  styles={styles}
                />
                <PreferenceToggle
                  label="Discussion activity"
                  value={preferences.discussionActivity}
                  disabled={muted || preferences.notificationLevel !== 'all_activity'}
                  onValueChange={(value) => setPreferences((current) => ({ ...current, discussionActivity: value }))}
                  theme={theme}
                  styles={styles}
                />
              </View>
            </>
          )}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.primaryButton, (loading || saving || !accountId) && styles.buttonDisabled]}
              disabled={loading || saving || !accountId}
              onPress={() => void save()}
            >
              <Text style={styles.primaryText}>{saving ? 'Saving' : 'Save settings'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PreferenceToggle({ label, value, disabled, onValueChange, theme, styles }: {
  label: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
  theme: typeof Colors.light;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={!disabled && value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.outline, true: theme.tint }}
      />
    </View>
  );
}

const createStyles = (theme: typeof Colors.light) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  card: { padding: 22, paddingBottom: 30, gap: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, gap: 5 },
  title: { color: theme.text, fontSize: 24, fontFamily: 'PlayfairDisplay_700Bold' },
  body: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline },
  levelStack: { gap: 9 },
  levelCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: theme.outline, borderRadius: 16, padding: 13 },
  levelCardSelected: { borderColor: theme.tint, backgroundColor: theme.backgroundSubtle },
  levelCopy: { flex: 1, gap: 3 },
  levelLabel: { color: theme.text, fontSize: 14, fontWeight: '800' },
  levelSupport: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  toggleStack: { gap: 2, borderTopWidth: 1, borderTopColor: theme.outline, paddingTop: 8 },
  disabledSection: { opacity: 0.5 },
  toggleRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: theme.text, fontSize: 14, fontWeight: '700' },
  error: { color: theme.danger, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: theme.outline },
  secondaryText: { color: theme.text, fontSize: 14, fontWeight: '800' },
  primaryButton: { flex: 1.3, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: theme.tint },
  primaryText: { color: theme.background, fontSize: 14, fontWeight: '900' },
  buttonDisabled: { opacity: 0.5 },
});
