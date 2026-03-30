import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/supabase/types/database';

type RecoveryRequestRow = Database['public']['Tables']['account_recovery_requests']['Row'];

const NOTICE_KEY_PREFIX = 'account_recovery_notice_seen_v1:';

const methodLabel = (value?: string | null) => {
  switch (String(value || '').trim().toLowerCase()) {
    case 'google':
      return 'Google';
    case 'apple':
      return 'Apple';
    case 'magic_link':
      return 'Email link';
    case 'email':
      return 'Email + password';
    default:
      return 'your usual sign-in method';
  }
};

export default function AccountRecoveryNotice() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [notice, setNotice] = useState<RecoveryRequestRow | null>(null);

  const markSeen = useCallback(async (requestId: string) => {
    await AsyncStorage.setItem(`${NOTICE_KEY_PREFIX}${requestId}`, 'true');
  }, []);

  const loadLatestNotice = useCallback(async () => {
    if (!user?.id) {
      setNotice(null);
      return;
    }

    const { data, error } = await supabase
      .from('account_recovery_requests')
      .select('*')
      .eq('requester_user_id', user.id)
      .eq('status', 'resolved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) {
      setNotice(null);
      return;
    }

    const seen = await AsyncStorage.getItem(`${NOTICE_KEY_PREFIX}${data.id}`);
    setNotice(seen === 'true' ? null : data);
  }, [user?.id]);

  useEffect(() => {
    void loadLatestNotice();
  }, [loadLatestNotice]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`account_recovery_notices:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'account_recovery_requests',
          filter: `requester_user_id=eq.${user.id}`,
        },
        () => {
          void loadLatestNotice();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLatestNotice, user?.id]);

  const dismissNotice = async () => {
    if (!notice?.id) return;
    await markSeen(notice.id);
    setNotice(null);
  };

  const signOutAndContinue = async () => {
    if (notice?.id) {
      await markSeen(notice.id);
    }
    setNotice(null);
    await signOut();
    router.replace('/(auth)/welcome');
  };

  if (!notice) return null;

  const restoredMethod = methodLabel(notice.previous_sign_in_method);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.shadow} />
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(18, 28, 27, 0.985)', 'rgba(15, 23, 23, 0.985)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.cardGradient}
        >
          <View style={styles.accentGlow} />
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#A8F1EE" />
          </View>
          <Text style={styles.eyebrow}>ACCOUNT RESTORED</Text>
          <Text style={styles.title}>Your Betweener account is ready</Text>
          <Text style={styles.body}>
            We’ve completed your recovery. Sign out of this session, then sign back in using {restoredMethod}.
          </Text>

          <Pressable style={styles.primaryWrap} onPress={signOutAndContinue}>
            <LinearGradient
              colors={['#2AD9D4', '#16C7C3', '#1797B1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryText}>Sign out to continue</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)' }]}
            onPress={dismissNotice}
          >
            <Text style={[styles.secondaryText, { color: '#F7F3EE' }]}>Later</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 58,
    zIndex: 1002,
  },
  shadow: {
    position: 'absolute',
    top: 8,
    left: 6,
    right: 6,
    bottom: -4,
    borderRadius: 26,
    backgroundColor: 'rgba(4, 12, 12, 0.28)',
    opacity: 0.45,
  },
  card: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardGradient: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  accentGlow: {
    position: 'absolute',
    right: -22,
    top: -10,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 214, 153, 0.12)',
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    color: '#A8F1EE',
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  title: {
    color: '#FBF6F1',
    fontSize: 25,
    lineHeight: 30,
    fontFamily: 'Archivo_700Bold',
    marginBottom: 8,
  },
  body: {
    color: 'rgba(245, 239, 232, 0.82)',
    fontSize: 14.5,
    lineHeight: 22,
    fontFamily: 'Manrope_500Medium',
    marginBottom: 18,
  },
  primaryWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  primaryText: {
    color: '#fff',
    fontSize: 15.5,
    fontFamily: 'Manrope_700Bold',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryText: {
    fontSize: 14.5,
    fontFamily: 'Manrope_700Bold',
  },
});
