import {
  FlashList,
  type FlashListRef,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import { useCallback, type ReactElement, type ReactNode, type RefObject } from 'react';
import type { MessageType } from './types';

type ChatMessageListProps = {
  routeKey: string;
  listRef: RefObject<FlashListRef<MessageType> | null>;
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
 * FlashList owns cell recycling while messages remain in chronological order.
 * Starting from the bottom avoids measuring every older attachment before the
 * latest messages become visible, and item types prevent incompatible media
 * rows from sharing a recycle pool.
 */
export const ChatMessageList = ({
  routeKey, listRef, messages, renderItem, getItemType, keyExtractor,
  contentContainerStyle, header, empty, onScroll, onStartReached,
  onContentSizeChange, onLayout, onScrollBeginDrag, onScrollEndDrag,
  onMomentumScrollBegin, onMomentumScrollEnd, onViewableItemsChanged,
  viewabilityConfig,
}: ChatMessageListProps) => {
  const renderMessageItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MessageType>) =>
      renderItem({ item, index }),
    [renderItem],
  );

  return (
    <FlashList
      key={routeKey}
      ref={listRef}
      data={messages}
      renderItem={renderMessageItem}
      getItemType={getItemType}
      keyExtractor={keyExtractor}
      contentContainerStyle={contentContainerStyle}
      ListHeaderComponent={header as any}
      ListEmptyComponent={empty as any}
      showsVerticalScrollIndicator={false}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onStartReached={onStartReached}
      onStartReachedThreshold={0.08}
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
