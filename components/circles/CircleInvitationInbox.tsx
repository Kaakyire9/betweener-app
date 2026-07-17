import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  listMyCircleInvitations,
  respondToCircleInvitation,
  type MyCircleInvitation,
} from '@/lib/circles/circle-invitations';
import { supabase } from '@/lib/supabase';

type Props = {
  profileId: string | null;
  onChanged?: () => void;
};

export default function CircleInvitationInbox({ profileId, onChanged }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const styles = useMemo(() => createStyles(theme, (colorScheme ?? 'light') === 'dark'), [colorScheme, theme]);
  const [items, setItems] = useState<MyCircleInvitation[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!profileId) {
      setItems([]);
      return;
    }
    try {
      setItems(await listMyCircleInvitations(profileId));
    } catch {
      setItems([]);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
    if (!profileId) return;

    const scheduleLoad = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        void load();
      }, 250);
    };
    const channel = supabase
      .channel(`circle-invitations:inbox:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'circle_invitations',
          filter: `invited_profile_id=eq.${profileId}`,
        },
        scheduleLoad,
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleLoad();
        }
      });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleLoad();
    });

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      appStateSubscription.remove();
      supabase.removeChannel(channel);
    };
  }, [load, profileId]);

  const decline = (invitation: MyCircleInvitation) => {
    if (!profileId || respondingId) return;
    Alert.alert('Decline invitation?', `You can still discover ${invitation.circleName} later.`, [
      { text: 'Keep invitation', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          setRespondingId(invitation.id);
          void respondToCircleInvitation(invitation.circleId, profileId, false)
            .then(async () => {
              await load();
              onChanged?.();
            })
            .catch((error) => Alert.alert('Circle invitation', error instanceof Error ? error.message : 'Could not decline the invitation.'))
            .finally(() => setRespondingId(null));
        },
      },
    ]);
  };

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Private invitations</Text>
          <Text style={styles.title}>Circles waiting for you</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{items.length}</Text>
        </View>
      </View>
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          {item.circleImageUrl ? (
            <Image source={{ uri: item.circleImageUrl }} style={styles.image} />
          ) : (
            <View style={styles.imageFallback}>
              <MaterialCommunityIcons name="account-group-outline" size={22} color={theme.tint} />
            </View>
          )}
          <View style={styles.copy}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.circleName}</Text>
            <Text style={styles.meta} numberOfLines={1}>Invited by {item.inviterName}</Text>
            {item.message ? <Text style={styles.message} numberOfLines={2}>{item.message}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.push(`/circles/${item.circleId}`)}>
                <Text style={styles.primaryText}>Review</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={!!respondingId} style={styles.secondaryButton} onPress={() => decline(item)}>
                <Text style={styles.secondaryText}>{respondingId === item.id ? 'Declining' : 'Decline'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, dark: boolean) => StyleSheet.create({
  section: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: theme.tint, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: theme.text, fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  countPill: { minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.tint },
  countText: { color: theme.backgroundSubtle, fontSize: 12, fontWeight: '900' },
  card: { flexDirection: 'row', gap: 12, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: theme.outline, backgroundColor: dark ? theme.backgroundSubtle : '#fffaf5' },
  image: { width: 58, height: 58, borderRadius: 19 },
  imageFallback: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: theme.background },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { color: theme.text, fontSize: 14, fontWeight: '900' },
  meta: { color: theme.textMuted, fontSize: 11 },
  message: { color: theme.textMuted, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 5 },
  primaryButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 16, backgroundColor: theme.tint },
  primaryText: { color: theme.backgroundSubtle, fontSize: 11, fontWeight: '900' },
  secondaryButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.outline },
  secondaryText: { color: theme.textMuted, fontSize: 11, fontWeight: '800' },
});
