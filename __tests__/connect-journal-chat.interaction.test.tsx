import React, { createRef } from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
const {entry}=require('./fixtures/connect-journal-fixture.cjs');
const mockScroll=jest.fn(),mockEnd=jest.fn();let mockList:any;
let mockFeed:any;
jest.mock('@/features/connect/journal/use-journal-feed',()=>({useJournalFeed:()=>mockFeed}));
jest.mock('@/features/connect/journal/ConnectedCallTimelineCard',()=>({ConnectedCallTimelineCard:()=>require('react').createElement(require('react-native').Text,null,'CALL EVENT')}));
jest.mock('@/features/connect/journal/JournalPrimitives',()=>({useJournalTheme:()=>({colors:{tint:'#008080'}})}));
jest.mock('@shopify/flash-list',()=>({FlashList:require('react').forwardRef(function Fixture(props:any,ref:any){
 const React=require('react'),{View}=require('react-native');mockList=props;React.useImperativeHandle(ref,()=>({scrollToIndex:mockScroll,scrollToEnd:mockEnd}));
 return React.createElement(View,null,props.data.map((item:any,index:number)=>React.createElement(View,{key:props.keyExtractor(item)},props.renderItem({item,index}))));
})}));
const messages:any[]=[{id:'m1',text:'Before',timestamp:new Date('2026-11-05T09:00Z')},{id:'m2',text:'After',timestamp:new Date('2026-11-05T11:00Z')}];
function props(){return{routeKey:'peer',journalPeerUserId:'peer',listRef:createRef<any>(),messages,renderItem:jest.fn(({item}:any)=><Text>{item.text}</Text>),getItemType:()=> 'text',keyExtractor:(m:any)=>m.id,
 contentContainerStyle:{},header:null,empty:null,onScroll:jest.fn(),onStartReached:jest.fn(),onContentSizeChange:jest.fn(),onLayout:jest.fn(),onScrollBeginDrag:jest.fn(),onScrollEndDrag:jest.fn(),onMomentumScrollBegin:jest.fn(),onMomentumScrollEnd:jest.fn(),onViewableItemsChanged:jest.fn(),viewabilityConfig:{}};}
beforeEach(()=>{mockScroll.mockClear();mockEnd.mockClear();mockFeed={ready:true,rows:[entry()],freshIds:new Set(),hasMore:false,busy:false,more:jest.fn()};});
it('call cells preserve original message indexes and never enter read-receipt callbacks',async()=>{
 const p=props(),screen=await render(<ChatMessageList {...p}/>);expect(screen.getByText('CALL EVENT')).toBeTruthy();
 expect(p.renderItem.mock.calls.map((a:any)=>a[0].index)).toEqual([0,1]);
 expect(p.renderItem.mock.calls.map((a:any)=>[!!a[0].journalBoundaryBefore,!!a[0].journalBoundaryAfter])).toEqual([[false,true],[true,false]]);
 mockList.onViewableItemsChanged({viewableItems:mockList.data.map((item:any,index:number)=>({item,index})),changed:[]});
 const event:any=p.onViewableItemsChanged.mock.calls[0][0];expect(event.viewableItems.map((v:any)=>v.item.id)).toEqual(['m1','m2']);
 p.listRef.current.scrollToIndex({index:1,animated:false});expect(mockScroll).toHaveBeenCalledWith({index:2,animated:false});
 expect(messages.map(m=>m.id)).toEqual(['m1','m2']);
});
it('the default-off branch uses the original list data, keys and ref directly',async()=>{
 mockFeed={...mockFeed,ready:false};const p=props();await render(<ChatMessageList {...p}/>);
 expect(mockList.data).toBe(messages);expect(mockList.keyExtractor(messages[0])).toBe('m1');
 p.listRef.current.scrollToIndex({index:1});expect(mockScroll).toHaveBeenCalledWith({index:1});
});
it('earlier call loading is incremental and leaves the existing message loader in place',async()=>{
 mockFeed.hasMore=true;const p=props();await render(<ChatMessageList {...p}/>);mockList.onStartReached();
 expect(p.onStartReached).toHaveBeenCalledTimes(1);expect(mockFeed.more).toHaveBeenCalledTimes(1);
});
