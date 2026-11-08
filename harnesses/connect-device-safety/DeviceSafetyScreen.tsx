import React, { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { createOfflineSafetySession } from './local-session.ts';
import { inspectLocalBinary, loadLocalHardware } from './native-hardware.ts';
import type { NativeAuthSnapshot } from '../../features/connect/media/native-owner-types.ts';

type Session = ReturnType<typeof createOfflineSafetySession>;
type Runtime = Awaited<ReturnType<typeof loadLocalHardware>>;
export function DeviceSafetyScreen({ network }: { network: { snapshot(): unknown } }) {
  const session = useRef<Session | null>(null);
  const auth = useRef<NativeAuthSnapshot | null>({ authenticated: true, userId: 'offline-actor-a', generation: 'offline-epoch-1' });
  const authListeners = useRef(new Set<() => void>());
  const [isolated, setIsolated] = useState(false);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [binary, setBinary] = useState<ReturnType<typeof inspectLocalBinary> | null>(null);
  const [receipt, setReceipt] = useState('No native module loaded. Physical devices: NOT_TESTED.');
  const [message, setMessage] = useState('');
  const [observation, setObservation] = useState('');
  const [cameraUrl, setCameraUrl] = useState<string>();
  const [retired, setRetired] = useState(false);
  const refresh = () => {
    const current = session.current;
    if (!current) return;
    setCameraUrl(current.cameraStreamUrl());
    setRetired(current.owner.getSnapshot().retired);
    setReceipt(JSON.stringify({ ...current.receipt(), deniedNetworkAttempts: network.snapshot() }, null, 2));
  };
  const run = (operation: () => unknown) => {
    try {
      void Promise.resolve(operation()).then(() => { setMessage('Operation returned; hardware result requires independent evidence.'); refresh(); }, () => {
        setMessage('Operation failed. Inspect receipt; ownership remains scoped to this session.'); refresh();
      });
      refresh();
    } catch { setMessage('Operation rejected. Inspect receipt.'); refresh(); }
  };
  useEffect(() => {
    const interval = setInterval(refresh, 500);
    return () => { clearInterval(interval); void session.current?.stop('navigation').catch(() => undefined); };
    // This standalone screen has one session for the lifetime of the JS runtime.
  }, []);
  const arm = async () => {
    if (!isolated || session.current) throw new Error('device_harness_not_armed');
    const inspected = inspectLocalBinary(); setBinary(inspected);
    if (!inspected.moduleContractComplete) throw new Error('device_harness_existing_binary_incomplete_stop_for_owner_approval');
    const loaded = await loadLocalHardware();
    setRuntime(loaded);
    session.current = createOfflineSafetySession({ development: __DEV__, externalEgressBlocked: isolated,
      hardware: loaded.hardware, audio: loaded.audio, lifecycle: loaded.lifecycle, permission: loaded.permission,
      auth: { snapshot: () => auth.current, subscribe(listener) {
        authListeners.current.add(listener); return () => { authListeners.current.delete(listener); };
      } },
    });
    refresh();
  };
  const changeAccount = (value: NativeAuthSnapshot | null) => {
    auth.current = value; for (const listener of authListeners.current) listener(); refresh();
  };
  const active = !!session.current && !retired;
  const Preview = runtime?.RTCView;
  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>Connect offline safety lab</Text>
    <Text>Development only. Local hardware seam; Stream factory, SDK call lifecycle and remote enforcement are unverified.</Text>
    <Text>Before opening this lab: block native/OS external egress and use local Metro only. USB loopback qualifies only with other external routes blocked. LAN requires independently verified isolation allowing only phone-to-laptop Metro; ordinary home Wi-Fi does not qualify. The JS guard cannot establish this isolation or disable native OTA checks.</Text>
    <View style={styles.row}><Switch value={isolated} onValueChange={setIsolated} disabled={!!session.current} />
      <Text style={styles.flex}>External egress isolation is established and recorded.</Text></View>
    <Button title="1. Check native modules (no sensors)" disabled={!isolated || !!session.current} onPress={() => {
      const inspected = inspectLocalBinary(); setBinary(inspected);
      setMessage(inspected.moduleContractComplete ? 'Module/API presence checks passed. Hardware remains untested.'
        : `STOP. Missing or unreadable native capability: ${[...inspected.missing, ...inspected.inspectionErrors].join(', ')}`);
    }} />
    <Text selectable>{binary ? JSON.stringify(binary, null, 2) : 'Native module/API presence has not been checked on this device.'}</Text>
    <Button title="2. Arm local test session (no capture yet)" disabled={!isolated || !binary?.moduleContractComplete || !!session.current} onPress={() => run(arm)} />
    <Button title="Create microphone track (requests permission)" disabled={!active} onPress={() => run(() => session.current!.microphone())} />
    <Button title="Disable / stop / release microphone track" disabled={!active} onPress={() => run(() => session.current!.disableMicrophone())} />
    <Button title="Optional camera capture (requests permission)" disabled={!active} onPress={() => run(() => session.current!.camera())} />
    {Preview && cameraUrl ? <Preview streamURL={cameraUrl} style={styles.preview} objectFit="contain" /> : null}
    <Button title="Play generated local tone (low volume)" disabled={!active} onPress={() => run(() => session.current!.startTone())} />
    <Text>There is no microphone PCM receiver or peer loopback. Camera preview and tone playback are local positive controls; microphone activity still requires native/OS evidence.</Text>
    <Button title="Inject recoverable cleanup failure" disabled={!active} onPress={() => run(() => session.current!.setCleanupFault('fail'))} />
    <Button title="Hold cleanup completion" disabled={!active} onPress={() => run(() => session.current!.setCleanupFault('hold'))} />
    <Button title="STOP all local media / cancel pending capture" disabled={!session.current} color="#a32121" onPress={() => run(() => session.current!.stop())} />
    <Button title="Explicitly clear injected fault and retry cleanup" disabled={!retired} onPress={() => run(() => session.current!.retryCleanup())} />
    <Button title="Simulate logout (local Auth epoch only)" disabled={!active} onPress={() => changeAccount(null)} />
    <Button title="Simulate account switch (local Auth epoch only)" disabled={!active} onPress={() => changeAccount({ authenticated: true, userId: 'offline-actor-b', generation: 'offline-epoch-2' })} />
    <Text>Background/blur or an observed iOS interruption retires this session. Foreground never resumes it. Android focus-only interruptions and actual Callingx routing require separate device evidence. One session per process; no automatic restart or timeout release.</Text>
    <Text>Independent observation JSON: source (os_instrumentation/external_observer), axis (microphone/camera/playback/route), phase (active_before_shutdown/stopped_after_shutdown/continued_after_shutdown/unknown), reference, observedAt (ISO timestamp). Operator-entered evidence is separate and never upgrades acceptance automatically.</Text>
    <TextInput multiline style={styles.input} value={observation} onChangeText={setObservation} placeholder="Paste one independent observation with a local evidence reference" />
    <Button title="Append independent observation" disabled={!session.current} onPress={() => run(() => session.current!.recordIndependent(JSON.parse(observation)))} />
    <Text>{message}</Text>
    <Text selectable style={styles.receipt}>{receipt}</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({ container: { padding: 24, gap: 14, backgroundColor: '#f5f7fa' },
  title: { fontSize: 24, fontWeight: '700' }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, flex: { flex: 1 },
  preview: { height: 220 }, input: { minHeight: 100, padding: 12, borderWidth: 1, borderColor: '#677' }, receipt: { fontFamily: 'monospace', fontSize: 11 } });
