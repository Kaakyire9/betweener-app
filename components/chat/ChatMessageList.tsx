import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { ReactNode, RefObject } from 'react';
import { Platform } from 'react-native';
import type { MessageType } from './types';

type ChatMessageListProps = {
  routeKey: string;
  listRef: RefObject<FlashListRef<MessageType> | null>;
  messages: MessageType[];
  renderItem: (info: { item: MessageType; index: number }) => ReactNode;
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

/** Presentational virtualized message list. Thread state stays in the controller. */
export const ChatMessageList = ({
  routeKey, listRef, messages, renderItem, getItemType, keyExtractor,
  contentContainerStyle, header, empty, onScroll, onStartReached,
  onContentSizeChange, onLayout, onScrollBeginDrag, onScrollEndDrag,
  onMomentumScrollBegin, onMomentumScrollEnd, onViewableItemsChanged,
  viewabilityConfig,
}: ChatMessageListProps) => (
  <FlashList
    key={routeKey}
    ref={listRef}
    data={messages}
    renderItem={renderItem as any}
    getItemType={getItemType}
    keyExtractor={keyExtractor}
    contentContainerStyle={contentContainerStyle}
    ListHeaderComponent={header as any}
    ListEmptyComponent={empty as any}
    drawDistance={900}
    removeClippedSubviews={Platform.OS === 'android'}
    showsVerticalScrollIndicator={false}
    bounces={false}
    alwaysBounceVertical={false}
    overScrollMode="never"
    maintainVisibleContentPosition={{ disabled: false, animateAutoScrollToBottom: false }}
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
