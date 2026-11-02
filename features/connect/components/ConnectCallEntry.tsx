import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useConnectProduct } from './ConnectProductProvider';
import { connectUuid } from '../domain/call-navigation';

/** Match/grant inputs select a server check; they never certify eligibility. */
export function ConnectCallEntry({ peerId, blocked = false, grantId }: { peerId: string | null; blocked?: boolean; grantId?: string }) {
  const { ui, status } = useConnectProduct(), router = useRouter();
  if (!ui || status !== 'ready' || blocked || !connectUuid(peerId)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Invite to a voice call" onPress={() => router.push({ pathname: '/connect/voice',
    params: { peerId, authorization: grantId ? 'pre_match' : 'matched', ...(grantId ? { grantId } : {}) } })} style={styles.button}>
    <Ionicons name="call-outline" color={Colors.dark.secondary} size={22} />
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 } });
