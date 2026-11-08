import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import React, { memo, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MessageType } from './types';
import { mergeJournalTimeline, journalMessageIndex, type JournalTimelineItem } from '@/features/connect/journal/journal-timeline';
import { useJournalFeed } from '@/features/connect/journal/use-journal-feed';
import { ConnectedCallTimelineCard } from '@/features/connect/journal/ConnectedCallTimelineCard';
import { useJournalTheme } from '@/features/connect/journal/JournalPrimitives';
import { PlainChatMessageList, type PlainChatMessageListProps } from './PlainChatMessageList';
const START_RENDERING_FROM_BOTTOM = Object.freeze({ startRenderingFromBottom: true });
type TimelineItem = JournalTimelineItem<MessageType>;
type ChatMessageListProps = PlainChatMessageListProps & { journalPeerUserId?: string | null; hasEarlierMessages?: boolean };
/** Calls are independent typed timeline cells. Message callbacks retain their original indexes and data. */
export const ChatMessageList = memo(function ChatMessageList(props: ChatMessageListProps) {
  const calls = useJournalFeed({ scope: 'chat', peerUserId: props.journalPeerUserId ?? undefined }, !!props.journalPeerUserId);
  return calls.ready ? <JournalChatMessageList {...props} calls={calls} /> : <PlainChatMessageList {...props} />;
});
function JournalChatMessageList(props: ChatMessageListProps & { calls: ReturnType<typeof useJournalFeed> }) {
  const { colors } = useJournalTheme(), { calls } = props;
  const rows = useMemo(() => mergeJournalTimeline(props.messages, calls.rows, props.hasEarlierMessages), [calls.rows, props.hasEarlierMessages, props.messages]);
  const innerRef = useRef<FlashListRef<TimelineItem>>(null);
  useImperativeHandle(props.listRef, () => new Proxy({} as FlashListRef<MessageType>, {
    get(_object, name) {
      const target = innerRef.current;
      if (!target) return undefined;
      if (name === 'scrollToIndex') return (options: Parameters<FlashListRef<MessageType>['scrollToIndex']>[0]) => {
        const index = journalMessageIndex(rows, options.index);
        if (index >= 0) return target.scrollToIndex({ ...options, index });
      };
      const value = Reflect.get(target, name);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }), [rows]);
  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<TimelineItem>) => item.kind === 'call'
    ? <ConnectedCallTimelineCard entry={item.entry} fresh={calls.freshIds.has(item.entry.call.id)} />
    : props.renderItem({ item: item.message, index: item.messageIndex, journalBoundaryBefore: rows[index - 1]?.kind === 'call', journalBoundaryAfter: rows[index + 1]?.kind === 'call' }), [calls.freshIds, props.renderItem, rows]);
  const viewable = useCallback((event: any) => {
    const messages = (tokens: any[] = []) => tokens.filter(token => token.item?.kind === 'message')
      .map(token => ({ ...token, item: token.item.message, index: token.item.messageIndex }));
    props.onViewableItemsChanged?.({ ...event, viewableItems: messages(event.viewableItems), changed: messages(event.changed) });
  }, [props.onViewableItemsChanged]);
  const header = <View>{typeof props.header === 'function' ? props.header() : props.header}
    {calls.hasMore && <Pressable accessibilityRole="button" accessibilityLabel="Load earlier call events" disabled={calls.busy} onPress={() => { void calls.more(); }} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.tint, fontSize: 12 }}>{calls.busy ? 'Loading earlier calls…' : 'Earlier calls'}</Text></Pressable>}
  </View>;
  return <FlashList key={props.routeKey} ref={innerRef} data={rows} renderItem={renderItem}
    getItemType={item => item.kind === 'call' ? 'connect-call-event' : props.getItemType(item.message)}
    keyExtractor={item => item.kind === 'call' ? item.key : `message:${props.keyExtractor(item.message)}`}
    contentContainerStyle={props.contentContainerStyle} ListHeaderComponent={header} ListEmptyComponent={props.empty as any}
    showsVerticalScrollIndicator={false} bounces={false} alwaysBounceVertical={false} overScrollMode="never"
    maintainVisibleContentPosition={START_RENDERING_FROM_BOTTOM} onScroll={props.onScroll} scrollEventThrottle={16}
    onStartReached={() => { props.onStartReached(); if (calls.hasMore && !calls.busy) void calls.more(); }} onStartReachedThreshold={.08}
    onContentSizeChange={props.onContentSizeChange} onLayout={props.onLayout}
    onScrollBeginDrag={props.onScrollBeginDrag} onScrollEndDrag={props.onScrollEndDrag}
    onMomentumScrollBegin={props.onMomentumScrollBegin} onMomentumScrollEnd={props.onMomentumScrollEnd}
    onViewableItemsChanged={viewable} viewabilityConfig={props.viewabilityConfig} />;
}
