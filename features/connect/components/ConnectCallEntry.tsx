import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useConnectProduct } from './ConnectProductProvider';
import { connectUuid } from '../domain/call-navigation';
import type { ConnectMedia } from '../domain/connect';

/** Match/grant inputs select a server check; they never certify eligibility. */
export function ConnectCallEntry({ peerId, blocked = false, grantId, media = 'voice' }: { peerId: string | null; blocked?: boolean; grantId?: string; media?: ConnectMedia }) {
  const { ui, status, product } = useConnectProduct(), router = useRouter();
  if (!ui || status !== 'ready' || blocked || !connectUuid(peerId)) return null;
  if (media === 'video' && product?.flags?.videoCalling !== true) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Invite to a ${media} call`} onPress={() => router.push({ pathname: media === 'video' ? '/connect/video' : '/connect/voice',
    params: { peerId, authorization: grantId ? 'pre_match' : 'matched', ...(grantId ? { grantId } : {}) } })} style={styles.button}>
    <Ionicons name={media === 'video' ? 'videocam-outline' : 'call-outline'} color={Colors.dark.secondary} size={22} />
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 } });
