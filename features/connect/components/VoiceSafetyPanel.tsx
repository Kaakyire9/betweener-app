import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import type { VoiceViewState } from '../voice/voice-types';
import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags';
import { voiceSafetyStatus } from '../voice/voice-safety-status';
import { WithdrawCallingConsent } from './WithdrawCallingConsent';

export interface VoiceSafetyActions {
  endAndBlock(): void;
  checkStatus(): void;
  withdrawConsent?(): Promise<void>;
}
export function VoiceSafetyPanel({ state, actions, flags = connectFeatureFlags }: {
  state: VoiceViewState; actions?: VoiceSafetyActions; flags?: ConnectFeatureFlags;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const call = state.session;
  const binding = call ? JSON.stringify([call.id, call.created_at, call.caller_profile_id, call.recipient_profile_id, call.media, call.authorization]) : null;
  useEffect(() => { setConfirmation(null); setDetailsOpen(false); }, [binding]);
  const canBlock = flags.endCallAndBlock === true && !!actions && !!binding && !state.endBlock;
  const lines = voiceSafetyStatus(state);
  const local = state.localShutdown;
  const cleanupFailed = [local.microphone, local.camera, local.publication, local.playback, local.subscriptions, local.sdkLeave, local.resourceRelease].includes('failed');
  const cleanupPending = [local.sdkLeave, local.resourceRelease].includes('pending');
  const notice = state.endBlock ? null : cleanupFailed ? 'Audio cleanup needs attention. View Call details before calling again.'
    : cleanupPending ? 'Finishing audio cleanup…'
      : state.endStatus === 'unconfirmed' ? 'We could not confirm the call has ended. Check your connection.'
        : state.endStatus === 'pending' ? 'Waiting for the call to finish…' : null;
  const hasDetails = lines.length > 0 || !!state.audioSetupStage || !!state.audioSetupFailure
    || !!state.audioHealth || !!state.quality || !!actions?.withdrawConsent;
  return <View style={styles.root}>
    {notice && <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text>}
    {hasDetails && !state.endBlock && <Pressable accessibilityRole="button" accessibilityLabel="Call details" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen(!detailsOpen)} style={styles.button}>
      <Text style={styles.text}>{detailsOpen ? 'Hide call details' : 'Call details'}</Text>
    </Pressable>}
    {hasDetails && (detailsOpen || !!state.endBlock) && <View accessibilityLabel="Call safety status" style={styles.status}>
      {(state.audioSetupStage || state.audioSetupFailure) && <Text style={styles.text}>Audio setup: {state.audioSetupStage ?? state.audioSetupFailure!.stage}</Text>}
      {state.audioSetupFailure && <>
        <Text selectable style={styles.text}>Diagnostic code: {state.audioSetupFailure.code}</Text>
        {state.audioSetupFailure.missingNativeApis.map(name => <Text key={name} selectable style={styles.text}>Missing native API: {name}</Text>)}
      </>}
      {state.audioHealth && <>
        <Text style={styles.text}>Audio reception: {state.audioHealth.reception}</Text>
        <Text style={styles.text}>Outgoing audio traffic: {state.audioHealth.sending === null ? 'unavailable' : state.audioHealth.sending ? 'observed' : 'no new traffic observed'}</Text>
        <Text style={styles.text}>Audio packets received: {state.audioHealth.receivedPackets ?? 'unavailable'}</Text>
        <Text style={styles.text}>Audio jitter: {state.audioHealth.jitterMs ?? 'unavailable'} ms · Round trip: {state.audioHealth.roundTripMs ?? 'unavailable'} ms</Text>
        <Text style={styles.text}>Audible output still needs confirmation on the device.</Text>
      </>}
      <Text style={styles.text}>End-to-end encryption is not enabled for this staging call.</Text>
      {state.quality && <>
        <Text style={styles.text}>Local audio setup: {state.quality.setupMs ?? 'unavailable'} ms · First packet observation: {state.quality.firstReceivedPacketMs ?? 'unavailable'} ms</Text>
        <Text style={styles.text}>SDK resource release: {state.quality.sdkReleaseMs ?? 'unavailable'} ms · Betweener end acknowledgement: {state.quality.authorityEndMs ?? 'unavailable'} ms</Text>
      </>}
      {lines.map(line => <Text key={line} style={styles.text}>{line}</Text>)}
      {actions?.withdrawConsent && <WithdrawCallingConsent key={binding} withdraw={actions.withdrawConsent} />}
    </View>}
    {canBlock && <Pressable accessibilityRole="button" accessibilityLabel="End call and block" onPress={() => setConfirmation(binding)} style={styles.button}>
      <Text style={styles.danger}>End call &amp; Block</Text>
    </Pressable>}
    {canBlock && confirmation === binding && <View accessibilityLabel="Confirm account block" style={styles.status}>
      <Text style={styles.text}>End this call and block {state.peer?.name || 'this person'}? The account block must be saved before it is confirmed.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Confirm end call and block" onPress={() => {
        if (binding && confirmation === binding) { setConfirmation(null); actions?.endAndBlock(); }
      }} style={styles.button}><Text style={styles.danger}>Confirm block</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel account block" onPress={() => setConfirmation(null)} style={styles.button}><Text style={styles.text}>Keep current settings</Text></Pressable>
    </View>}
    {flags.endCallAndBlock === true && actions && state.endBlock && <Pressable accessibilityRole="button" accessibilityLabel="Check block and end status" onPress={actions.checkStatus} style={styles.button}>
      <Text style={styles.text}>Check status</Text>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  root: { width: '100%', gap: 12 }, status: { padding: 14, gap: 8, borderRadius: 16, backgroundColor: Colors.dark.backgroundSubtle },
  text: { color: Colors.dark.textMuted, fontSize: 13, lineHeight: 19 }, button: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  danger: { color: Colors.dark.danger, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
});
