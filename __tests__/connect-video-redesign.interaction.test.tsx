import React, { useState } from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { VideoCallScreen } from '@/features/connect/components/VideoCallScreen';
import type { VoiceViewState } from '@/features/connect/voice/voice-types';
import { unverifiedShutdown } from '@/features/connect/media/local-shutdown';
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => () => void) => { require('react').useEffect(callback, [callback]); } }));
jest.mock('expo-image', () => { const React=require('react'),{View}=require('react-native');return {Image:(p:object)=>React.createElement(View,p)}; });
jest.mock('expo-linear-gradient', () => { const React=require('react'),{View}=require('react-native');return {LinearGradient:(p:object)=>React.createElement(View,p)}; });
jest.mock('react-native-safe-area-context', () => { const React=require('react'),{View}=require('react-native');return {SafeAreaView:(p:object)=>React.createElement(View,p)}; });
jest.mock('@expo/vector-icons', () => ({ Ionicons:Object.assign(()=>null,{glyphMap:{}}),MaterialCommunityIcons:()=>null }));
jest.mock('@/hooks/use-color-scheme', () => ({useColorScheme:()=> 'dark'}));
const base:VoiceViewState={phase:'RINGING',peer:{profileId:'peer',name:'Ama',avatar:null},session:null,incoming:true,muted:true,route:'earpiece',routes:[],permission:null,error:null,busy:false,durationSeconds:null,foreground:true,localShutdown:unverifiedShutdown(),endBlock:null,video:{camera:'off',cameraWanted:true,facing:'front',error:null}};
const handlers=()=>({onAccept:jest.fn(),onDecline:jest.fn(),onHangup:jest.fn(),onMute:jest.fn(),onRoute:jest.fn(),onDone:jest.fn(),onOpenSettings:jest.fn(),onCamera:jest.fn(),onFlipCamera:jest.fn(),onVideoError:jest.fn()});
beforeEach(()=>{AppState.currentState='active';});
it('uses one Answer with an icon camera-mode switch; switching never invokes capture or Answer',async()=>{
 const h=handlers();
 function Harness(){const[on,setOn]=useState(true);return <VideoCallScreen {...h} state={{...base,video:{...base.video!,cameraWanted:on}}} source={null} flags={{endCallAndBlock:true,nativeSafetyOwner:true,videoCalling:true}} onAnswerCameraChange={setOn}/>;}
 const screen=await render(<Harness/>);
 expect(screen.getByLabelText('Answer video call')).toBeTruthy();
 await fireEvent.press(screen.getByLabelText('Camera on when answering'));
 expect(screen.getByLabelText('Answer with camera off')).toBeTruthy();
 expect(screen.queryByLabelText('Answer video call')).toBeNull();
 expect(h.onAccept).not.toHaveBeenCalled();expect(h.onCamera).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByLabelText('Answer with camera off'));expect(h.onAccept).toHaveBeenCalledTimes(1);
});
it('busy incoming controls cannot change the answer choice or accept twice',async()=>{
 const h=handlers(),mode=jest.fn();const screen=await render(<VideoCallScreen {...h} source={null} state={{...base,busy:true}} flags={{endCallAndBlock:true,videoCalling:true}} onAnswerCameraChange={mode}/>);
 expect(screen.getByLabelText('Camera on when answering')).toBeDisabled();expect(screen.getByLabelText('Answer video call')).toBeDisabled();
 await fireEvent.press(screen.getByLabelText('Answer video call'));expect(h.onAccept).not.toHaveBeenCalled();
});
it('renders a private caller preview only while outgoing and visible, then removes it at End',async()=>{
 const h=handlers(),source={render:jest.fn(()=> <Text>PRIVATE LOCAL PREVIEW</Text>)};
 const state={...base,incoming:false,video:{...base.video!,preview:'ready' as const}};
 const props={...h,source:null,privatePreview:source,flags:{endCallAndBlock:true,videoCalling:true}};
 const screen=await render(<VideoCallScreen {...props} state={state}/>);
 expect(screen.getByText('Only you can see this preview')).toBeTruthy();expect(screen.getByText('PRIVATE LOCAL PREVIEW')).toBeTruthy();
 await screen.rerender(<VideoCallScreen {...props} state={{...state,phase:'ENDED',encryption:{required:true,sdkConfirmed:false,identityVerified:false}}} canDismiss={false}/>);
 expect(screen.queryByText('PRIVATE LOCAL PREVIEW')).toBeNull();expect(screen.queryByText('Securing your call…')).toBeNull();
 expect(screen.getByLabelText('Done with video call')).toBeDisabled();
});
it('camera-off and connecting states retain an enabled End action',async()=>{
 const h=handlers();const screen=await render(<VideoCallScreen {...h} source={null} state={{...base,phase:'CONNECTING'}} flags={{endCallAndBlock:true,videoCalling:true}}/>);
 expect(screen.getByLabelText('End call')).toBeEnabled();
 await act(async()=>fireEvent.press(screen.getByLabelText('End call')));expect(h.onHangup).toHaveBeenCalledTimes(1);
 expect(h.onCamera).not.toHaveBeenCalled();
});
