import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { JournalScreen, type JournalScreenProps } from '@/features/connect/journal/JournalScreen';
import { JournalDetails } from '@/features/connect/journal/JournalDetails';
import { CallTimelineCard } from '@/features/connect/journal/CallTimelineCard';
const {entry}=require('./fixtures/connect-journal-fixture.cjs');
let mockTone='dark';
jest.mock('@/hooks/use-color-scheme',()=>({useColorScheme:()=>mockTone}));
jest.mock('@/components/chat/ChatBackground',()=>({ChatBackground:()=>null}));
jest.mock('expo-image',()=>({Image:(p:object)=>require('react').createElement(require('react-native').View,p)}));
jest.mock('@expo/vector-icons',()=>({Ionicons:()=>null}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:(p:object)=>require('react').createElement(require('react-native').View,p)}));
const props=():JournalScreenProps=>({rows:[entry()],busy:false,error:null,hasMore:false,search:'',filter:'all',direction:'all',
 onSearch:jest.fn(),onFilter:jest.fn(),onDirection:jest.fn(),onDateRange:jest.fn(),onRefresh:jest.fn(),onMore:jest.fn(),onClose:jest.fn(),onDetails:jest.fn(),onRedial:jest.fn(),canRedial:()=>false});
beforeEach(()=>{mockTone='dark';});
it.each(['dark','light'])('renders the %s Journal with media, outcome, time, duration and accessible details',async(tone)=>{
 mockTone=tone;const p=props(),screen=await render(<JournalScreen {...p}/>);
 expect(screen.getByText('Your Connections')).toBeTruthy();expect(screen.getByText('Dufie')).toBeTruthy();expect(screen.getByText(/Voice call ended/)).toBeTruthy();expect(screen.getByText(/12m 24s/)).toBeTruthy();
 await fireEvent.press(screen.getByLabelText(/Dufie.*View call details/));expect(p.onDetails).toHaveBeenCalledTimes(1);
});
it('search and filters have explicit accessible controls and preserve the selected query',async()=>{
 const p=props(),screen=await render(<JournalScreen {...p}/>);await fireEvent.press(screen.getByLabelText('Search call history'));
 await fireEvent.changeText(screen.getByLabelText('Search connections by contact name'),'Dufie');expect(p.onSearch).toHaveBeenCalledWith('Dufie');
 await fireEvent.press(screen.getByLabelText('Missed'));expect(p.onFilter).toHaveBeenCalledWith('missed');
 await fireEvent.press(screen.getByLabelText('Filter calls by direction, date and outcome'));await fireEvent.press(screen.getByLabelText('Incoming'));expect(p.onDirection).toHaveBeenCalledWith('incoming');
});
it('empty and offline/error views do not offer new calls with calling disabled',async()=>{
 const screen=await render(<JournalScreen {...props()} rows={[]} callingAvailable={false}/>);expect(screen.getByText('Your conversations will find a home here.')).toBeTruthy();expect(screen.queryByText('Call again')).toBeNull();
 await screen.rerender(<JournalScreen {...props()} rows={[]} offline error="History could not be refreshed"/>);expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByLabelText('Retry call history')).toBeTruthy();
});
it('typed chat cards distinguish no answer from a connected zero-second call and keep Details explicit',async()=>{
 const details=jest.fn(),repeat=jest.fn(),e=entry(1,{state:'MISSED',connected_at:null});
 const screen=await render(<CallTimelineCard entry={e} onDetails={details} onRedial={repeat}/>);expect(screen.getByText('No answer')).toBeTruthy();expect(screen.queryByText(/0s/)).toBeNull();
 await fireEvent.press(screen.getByLabelText('Details of no answer'));expect(details).toHaveBeenCalledTimes(1);expect(repeat).not.toHaveBeenCalled();
});
it('ended details show Block user and never claim an active End Call & Block action',async()=>{
 const noop=jest.fn();const screen=await render(<JournalDetails entry={entry()} fresh onClose={noop} onRedial={noop} onChat={noop} onProfile={noop} onBlock={noop} onReport={noop} onRetry={noop}/>);
 expect(screen.getByLabelText('Block user')).toBeTruthy();expect(screen.queryByLabelText('End Call & Block')).toBeNull();expect(screen.getByText('Connected duration')).toBeTruthy();
});
it('blocked or unverified details never expose a functional redial shortcut',async()=>{
 const e=entry();e.peer={...e.peer,blocked:true,available:false,chatVisible:false};const noop=jest.fn();
 const screen=await render(<JournalDetails entry={e} fresh={false} onClose={noop} onRedial={noop} onChat={noop} onProfile={noop} onBlock={noop} onReport={noop} onRetry={noop}/>);
 expect(screen.queryByLabelText('Call again')).toBeNull();expect(screen.queryByLabelText('Send message')).toBeNull();expect(screen.getByLabelText('Report a concern')).toBeDisabled();
});
