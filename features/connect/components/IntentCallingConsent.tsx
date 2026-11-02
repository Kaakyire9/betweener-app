import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnectProduct } from './ConnectProductProvider';
import { ConnectCallEntry } from './ConnectCallEntry';
import { connectUuid } from '../domain/call-navigation';
import { intentConsentPresentation, type IntentCallingContext } from '../domain/intent-consent';
import type { ConnectProduct } from '../application/product-coordinator';

/** Text-Intent acceptance never calls decideGrant. Explicit media approval lives here. */
export function IntentCallingConsent({ intentId }: { intentId: string }) {
  const context = useConnectProduct();
  if (!context.ui || context.status !== 'ready' || !context.product || !connectUuid(intentId)) return null;
  return <BoundConsent key={`${context.product.authGeneration}:${intentId}`} product={context.product} intentId={intentId} />;
}
function BoundConsent({ product, intentId }: { product: ConnectProduct; intentId: string }) {
  const dark = useColorScheme() === 'dark', [value, setValue] = useState<IntentCallingContext | null>(null);
  const [voice, setVoice] = useState(false), [video, setVideo] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const mounted = useRef(true), pending = useRef(false), readSequence = useRef(0);
  const [now, setNow] = useState(Date.now);
  const load = useCallback(async () => {
    const sequence = ++readSequence.current;
    const next = await product.services.consent.get(intentId);
    if (mounted.current && sequence === readSequence.current) setValue(next);
  }, [intentId, product]);
  useEffect(() => { mounted.current = true; void load().catch(() => { if (mounted.current) setError('Calling permissions are unavailable.'); });
    return () => { mounted.current = false; }; }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const run = async (command?: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await command?.(); await load(); if (mounted.current) { setVoice(false); setVideo(false); } }
    catch { if (mounted.current) { setValue(null); setError('The change could not be confirmed. Refresh before trying again.'); } }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const p = value && intentConsentPresentation(value, product.selfProfileId, now), grant = value?.grant;
  const text = dark ? '#F5F0E9' : '#193A3D', muted = dark ? '#B4CAC7' : '#546F70';
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={onPress}
    style={[styles.button, (busy || disabled) && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <View style={[styles.card, { backgroundColor: dark ? '#123239' : '#F0F7F4' }]}>
    <Text accessibilityRole="header" style={[styles.title, { color: text }]}>Calling, by invitation</Text>
    <Text style={[styles.note, { color: muted }]}>Only the request sender may start an approved call. You can withdraw permission at any time. Voice never includes video.</Text>
    {error && <Text accessibilityRole="alert" style={[styles.note, { color: muted }]}>{error}</Text>}
    {!value && button('Refresh calling permissions', () => { void run(); })}
    {value && p && <>
      <Text style={[styles.note, { color: text }]}>{p.state === 'accepted' ? `Approved: ${[grant?.voice && 'voice', grant?.video && 'video'].filter(Boolean).join(' and ')}.`
        : p.state === 'pending' ? p.sender ? 'Waiting for their explicit media approval.' : 'Choose what you want to allow. Accepting the text request grants no calling permission.'
        : p.state === 'not_offered' ? p.sender ? 'Offer availability. They choose whether to approve.' : 'No calling availability has been offered.'
        : 'Calling permission is expired, withdrawn or unavailable.'}</Text>
      {(p.canOffer || p.canDecide) && <>
        <View style={styles.row}><Text style={[styles.note, { color: text }]}>Voice {p.canOffer ? 'availability' : 'approval'}</Text><Switch accessibilityLabel={p.canOffer ? 'Offer voice availability' : 'Approve voice calling'} value={voice}
          disabled={busy || (p.canOffer ? !value.offer_voice : !grant?.requested_voice || !value.offer_voice)} onValueChange={setVoice} trackColor={{ true: '#138F91' }} /></View>
        <View style={styles.row}><Text style={[styles.note, { color: text }]}>Video {p.canOffer ? 'availability' : 'approval'} · separate</Text><Switch accessibilityLabel={p.canOffer ? 'Offer video availability' : 'Approve video calling'} value={video}
          disabled={busy || (p.canOffer ? !value.offer_video : !grant?.requested_video || !value.offer_video)} onValueChange={setVideo} trackColor={{ true: '#7B64AC' }} /></View>
        {!value.offer_video && <Text style={[styles.note, { color: muted }]}>Video calling is not available in this voice milestone.</Text>}
        {p.canOffer && button('Offer selected calling availability', () => { void run(() => product.services.consent.offer(intentId, voice, video)); }, !voice && !video)}
        {p.canDecide && <>{button('Approve selected media', () => { void run(() => product.services.consent.decide(grant!.id, voice, video)); }, !voice && !video)}
          {button('Decline calling permission', () => { void run(() => product.services.consent.decide(grant!.id, false, false)); })}</>}
      </>}
      {p.canWithdraw && button('Withdraw calling permission', () => { void run(() => product.services.consent.withdraw(grant!.id)); })}
      {p.canCallVoice && <View style={styles.row}><Text style={[styles.note, { color: text }]}>Invite them to a voice call</Text><ConnectCallEntry peerId={value.recipient_profile_id} grantId={grant!.id} /></View>}
      {button('Refresh calling permissions', () => { void run(); })}
    </>}
    <Text style={[styles.note, { color: muted }]}>Incoming invitations also require your calling preference above. These changes need a confirmed connection; an unconfirmed change is never shown as saved.</Text>
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, borderRadius: 20, gap: 10, marginVertical: 10 }, title: { fontSize: 17, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 20, flexShrink: 1 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  button: { minHeight: 44, padding: 12, borderRadius: 14, backgroundColor: '#137D80', justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '600' }, disabled: { opacity: 0.45 } });
