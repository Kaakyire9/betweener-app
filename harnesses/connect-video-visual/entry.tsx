// Isolated illustrative UI fixture: no Auth, controller, provider SDK or media capture.
import React, { useState } from 'react';
import { AppRegistry, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ExpoRoot, Stack } from 'expo-router';
import type { RequireContext } from 'expo-router/build/types';
import { VideoCallScreen } from '../../features/connect/components/VideoCallScreen';
import { VoiceCallLobby } from '../../features/connect/components/VoiceCallLobby';
import { unverifiedShutdown } from '../../features/connect/media/local-shutdown';
import type { VoicePhase, VoiceViewState } from '../../features/connect/voice/voice-types';
import type { VideoPresentation } from '../../features/connect/video/video-types';

function Preview() {
  const params = new URLSearchParams(globalThis.location.search);
  const [phase, setPhase] = useState<VoicePhase>((params.get('phase') || 'ACTIVE') as VoicePhase);
  const [camera, setCamera] = useState(params.get('cameraOff') !== 'true');
  const [answerMode, setAnswerMode] = useState(true), [muted,setMuted] = useState(false);
  const peer = { profileId: 'visual-fixture', name: params.get('long') ? 'Alexandria Aduboffour' : 'Dufie', avatar: 'https://connect-video-preview.invalid/remote.png' };
  const incoming = params.get('incoming') === 'true';
  const state: VoiceViewState = { phase, peer, session: { id: '00000000-0000-4000-8000-000000000001', caller_profile_id: 'visual-caller', recipient_profile_id: 'visual-fixture',
    media:'video', authorization:'matched', state:phase==='IDLE'?'REQUESTED':phase, version:1, created_at:'2026-11-05T00:00:00Z', accepted_at:null, connected_at:null, ended_at:null,
    deadline:null, reason:null, duration_seconds:null, encryption_required:true }, incoming, muted, route:'speaker',routes:['speaker','earpiece'],foreground:true,error:null,busy:false,permission:'granted',
    durationSeconds:['ACTIVE','ENDED'].includes(phase)?37:null,localShutdown:unverifiedShutdown(),endBlock:null,
    video:{camera:phase==='ACTIVE'&&camera?'on':'off',cameraWanted:answerMode,facing:'front',error:null,preview:!incoming&&phase==='RINGING'?'ready':'off'},
    encryption:phase==='ACTIVE'?{required:true,sdkConfirmed:true,identityVerified:false}:undefined };
  const renderPhoto=(local:boolean)=><Image accessible accessibilityLabel={local?'Illustrative self video':'Illustrative remote video'} source={{uri:`https://connect-video-preview.invalid/${local?'self':'remote'}.png`}} contentFit="cover" style={{width:'100%',height:'100%'}}/>;
  const source: VideoPresentation = { participants:()=>[{sessionId:'remote',local:false,cameraOn:params.get('remoteOff')!=='true'},{sessionId:'self',local:true,cameraOn:camera}],subscribe:()=>()=>{},render:(_,local)=>renderPhoto(local) };
  return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:innerWidth,height:innerHeight},insets:{top:18,bottom:12,left:0,right:0}}}><View style={{flex:1}}>
    {phase==='IDLE'?<VoiceCallLobby peer={peer} eligible pending={false} error={null} media="video" encryptionRequired onStart={()=>setPhase('RINGING')} onClose={()=>{}}/>
      :<VideoCallScreen state={state} flags={{nativeSafetyOwner:true,endCallAndBlock:true,videoCalling:true,videoCameraOnEntry:true}} source={source}
        privatePreview={{render:()=>renderPhoto(true)}} onAnswerCameraChange={setAnswerMode} onAccept={()=>{setCamera(answerMode);setPhase('ACTIVE');}} onDecline={()=>setPhase('ENDED')} onHangup={()=>setPhase('ENDED')}
        onMute={()=>setMuted(value=>!value)} onCamera={()=>setCamera(value=>!value)} onFlipCamera={()=>{}} onVideoError={()=>{}} onRoute={()=>{}} onDone={()=>{}} onOpenSettings={()=>{}}/>}
  </View></SafeAreaProvider>;
}
function VisualLayout() { return <Stack screenOptions={{ headerShown: false }} />; }
if (__DEV__ && Platform.OS==='web') {
  // A real isolated router supports the screen focus hook without loading app routes.
  const context = Object.assign((key: string) => ({ default: key === './_layout.tsx' ? VisualLayout : Preview }),
    { keys: () => ['./index.tsx', './_layout.tsx'], resolve: (key: string) => key, id: 'connect-video-visual' }) as RequireContext;
  function VisualRoot() { return <ExpoRoot context={context} />; }
  AppRegistry.registerComponent('ConnectVideoVisual',()=>VisualRoot);
  AppRegistry.runApplication('ConnectVideoVisual',{rootTag:document.getElementById('root')});
}
