import { useMemo, type ReactElement, type ReactNode, type RefObject } from 'react';
import { FlatList, Platform } from 'react-native';
import {
  invertedIndexToChronologicalIndex,
  toNewestFirstMessageOrder,
} from '@/lib/chat/message-list-order';
import type { MessageType } from './types';

type ChatMessageListProps = {
  routeKey: string;
  listRef: RefObject<FlatList<MessageType> | null>;
  messages: MessageType[];
  renderItem: (info: { item: MessageType; index: number }) => ReactElement | null;
  getItemType: (item: MessageType) => string;
  keyExtractor: (item: MessageType) => string;
  contentContainerStyle: any;
  header: ReactNode | (() => ReactNode);
  empty: ReactNode;
  onScroll: any;
  onStartReached: () => void;
  onContentSizeChange: (width: number, height: number) => void;
  onLayout: (event: any) => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumScrollBegin: () => void;
  onMomentumScrollEnd: () => void;
  onViewableItemsChanged: any;
  viewabilityConfig: any;
};

/**
 * Presentational virtualized message list.
 *
 * Newest-first data plus an inverted native list makes the newest message the
 * first deterministic render. This avoids waiting for an attachment-heavy
 * thread to measure every older row before the latest messages become visible.
 * The render adapter preserves chronological indexes for grouping metadata.
 */
export const ChatMessageList = ({
  routeKey, listRef, messages, renderItem, getItemType: _getItemType, keyExtractor,
  contentContainerStyle, header, empty, onScroll, onStartReached,
  onContentSizeChange, onLayout, onScrollBeginDrag, onScrollEndDrag,
  onMomentumScrollBegin, onMomentumScrollEnd, onViewableItemsChanged,
  viewabilityConfig,
}: ChatMessageListProps) => {
  const invertedMessages = useMemo(
    () => toNewestFirstMessageOrder(messages),
    [messages],
  );

  return (
    <FlatList
      key={routeKey}
      ref={listRef}
      data={invertedMessages}
      inverted
      renderItem={({ item, index }) =>
        renderItem({
          item,
          index: invertedIndexToChronologicalIndex(messages.length, index),
        })
      }
      keyExtractor={keyExtractor}
      contentContainerStyle={contentContainerStyle}
      ListFooterComponent={header as any}
      ListEmptyComponent={empty as any}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={16}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      showsVerticalScrollIndicator={false}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onEndReached={onStartReached}
      onEndReachedThreshold={0.08}
      onContentSizeChange={onContentSizeChange}
      onLayout={onLayout}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollBegin={onMomentumScrollBegin}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
    />
  );
};
