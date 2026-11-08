import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import type { VoiceViewState } from '../voice/voice-types';
import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags';
import { voiceSafetyStatus } from '../voice/voice-safety-status';
import { WithdrawCallingConsent } from './WithdrawCallingConsent';

export interface VoiceSafetyActions {
  verifyIdentity?(code: string): Promise<void>;
  reviewIdentity?(): Promise<string>;
  replaceIdentity?(code: string): Promise<void>;
  endAndBlock(): void;
  checkStatus(): void;
  withdrawConsent?(): Promise<void>;
}
export function VoiceSafetyPanel({ state, actions, flags = connectFeatureFlags }: {
  state: VoiceViewState; actions?: VoiceSafetyActions; flags?: ConnectFeatureFlags;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [identityReview, setIdentityReview] = useState<string | null>(null), [identityBusy,setIdentityBusy] = useState(false);
  const [identityError,setIdentityError] = useState<string | null>(null);
  const call = state.session;
  const binding = call ? JSON.stringify([call.id, call.created_at, call.caller_profile_id, call.recipient_profile_id, call.media, call.authorization]) : null;
  const identityRequest = useRef(0);
  useEffect(() => {
    setConfirmation(null); setDetailsOpen(false); setIdentityReview(null); setIdentityError(null); setIdentityBusy(false);
    return () => { identityRequest.current++; };
  }, [binding]);
  const identityAction = (work: () => Promise<string | void>, failure: string) => {
    const request = ++identityRequest.current;
    setIdentityBusy(true); setIdentityError(null);
    void work().then(code => {
      if (request === identityRequest.current) setIdentityReview(code || null);
    }, () => {
      if (request === identityRequest.current) setIdentityError(failure);
    }).finally(() => { if (request === identityRequest.current) setIdentityBusy(false); });
  };
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
    {flags.encryptedCalls === true && actions?.reviewIdentity && actions?.replaceIdentity && <>
      <Pressable accessibilityRole="button" accessibilityLabel="Review calling identity" disabled={identityBusy} style={styles.button} onPress={() => {
        identityAction(actions.reviewIdentity!, 'Calling identity could not be checked. Try again.');
      }}><Text style={styles.text}>Review calling identity</Text></Pressable>
      {identityReview && <View style={styles.status}>
        <Text style={styles.text}>Compare this code with your connection through a trusted channel. Confirm only after both codes match.</Text>
        <Text selectable accessibilityLabel="Identity verification code" style={styles.text}>{identityReview}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Confirm compared calling identity" disabled={identityBusy} style={styles.button} onPress={() => {
          const code=identityReview;
          identityAction(() => actions.replaceIdentity!(code), 'The calling identity changed again. Review the new code.');
        }}><Text style={styles.text}>We compared the codes — they match</Text></Pressable>
      </View>}
      {identityError && <Text accessibilityLiveRegion="polite" style={styles.text}>{identityError}</Text>}
    </>}
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
      <Text style={styles.text}>{state.encryption?.required
        ? state.encryption.sdkConfirmed ? 'End-to-end encryption is enabled by the SDK.' : 'Preparing required end-to-end encryption…'
        : 'End-to-end encryption is not enabled for this staging call.'}</Text>
      {state.encryption?.required && state.encryption.safetyCode && <>
        <Text style={styles.text}>{state.encryption.identityVerified ? 'Peer identity verified on this device.' : 'Compare this safety code with your connection through a trusted channel.'}</Text>
        <Text selectable accessibilityLabel="Call safety code" style={styles.text}>{state.encryption.safetyCode}</Text>
        {!state.encryption.identityVerified && actions?.verifyIdentity && <Pressable accessibilityRole="button" accessibilityLabel="The safety codes match" style={styles.button}
          onPress={() => { void actions.verifyIdentity!(state.encryption!.safetyCode!).catch(() => undefined); }}><Text style={styles.text}>We compared the codes — they match</Text></Pressable>}
      </>}
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
