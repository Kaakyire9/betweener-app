import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useJournalActions } from '@/features/connect/journal/use-journal-actions';
const {entry,id,deferred}=require('./fixtures/connect-journal-fixture.cjs');
const mockPush=jest.fn();let mockStore:any,mockProduct:any;
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('@/features/connect/journal/journal-context',()=>({useJournalStore:()=>mockStore}));
jest.mock('@/features/connect/components/ConnectProductProvider',()=>({useConnectProduct:()=>mockProduct}));
function Harness(){const actions=useJournalActions();return <><Pressable accessibilityRole="button" accessibilityLabel="Repeat" onPress={()=>{void actions.redial(entry());}}><Text>Repeat</Text></Pressable>{actions.error&&<Text accessibilityRole="alert">{actions.error}</Text>}</>;}
beforeEach(()=>{mockPush.mockClear();mockStore={current:()=>true,service:{userId:id(3),profileId:id(1),epoch:'epoch'},detail:jest.fn(async()=>entry())};
 mockProduct={ui:true,status:'ready',product:{accountUserId:id(3),authGeneration:'epoch',selfProfileId:id(1),flags:{nativeSafetyOwner:true,videoCalling:true},services:{checkEligibility:jest.fn(async()=>true)},controller:{start:jest.fn()},credentials:jest.fn()}};
});
it('default-off calling cannot be started by historical success',async()=>{
 mockProduct.ui=false;const screen=await render(<Harness/>);await fireEvent.press(screen.getByLabelText('Repeat'));expect(mockStore.detail).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
});
it('a newly blocked or withdrawn connection has no redial shortcut after canonical refresh',async()=>{
 const blocked=entry();blocked.peer.blocked=true;blocked.redialAllowed=false;mockStore.detail.mockResolvedValue(blocked);
 const screen=await render(<Harness/>);await fireEvent.press(screen.getByLabelText('Repeat'));await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect(mockProduct.product.services.checkEligibility).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
});
it('live eligibility is rechecked and stale consent rejects navigation',async()=>{
 mockProduct.product.services.checkEligibility.mockResolvedValue(false);const screen=await render(<Harness/>);await fireEvent.press(screen.getByLabelText('Repeat'));
 await waitFor(()=>expect(mockProduct.product.services.checkEligibility).toHaveBeenCalledWith(id(2),'voice','matched'));expect(mockPush).not.toHaveBeenCalled();
});
it('an allowed redial opens the existing explicit Start lobby without requesting media or credentials',async()=>{
 const screen=await render(<Harness/>);await fireEvent.press(screen.getByLabelText('Repeat'));await waitFor(()=>expect(mockPush).toHaveBeenCalledWith({pathname:'/connect/voice',params:{peerId:id(2),authorization:'matched'}}));
 expect(mockProduct.product.controller.start).not.toHaveBeenCalled();expect(mockProduct.product.credentials).not.toHaveBeenCalled();
});
it('duplicate taps are coalesced and an account change fences late eligibility',async()=>{
 const gate=deferred();mockProduct.product.services.checkEligibility.mockReturnValue(gate.promise);const screen=await render(<Harness/>);
 await fireEvent.press(screen.getByLabelText('Repeat'));await fireEvent.press(screen.getByLabelText('Repeat'));expect(mockStore.detail).toHaveBeenCalledTimes(1);
 mockStore.current=()=>false;gate.resolve(true);await Promise.resolve();expect(mockPush).not.toHaveBeenCalled();
});
