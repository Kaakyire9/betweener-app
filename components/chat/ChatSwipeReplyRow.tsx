import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';

import {
  CHAT_REPLY_SWIPE_TRIGGER_DISTANCE,
  clampReplySwipeDistance,
  shouldClaimReplySwipe,
  shouldCommitReplySwipe,
} from '@/lib/chat/swipe-reply-policy';

type ChatSwipeReplyRowProps = {
  children: ReactNode;
  disabled?: boolean;
  styles: Record<string, any>;
  iconColor: string;
  onReply: () => void;
};

export default function ChatSwipeReplyRow({
  children,
  disabled = false,
  styles,
  iconColor,
  onReply,
}: ChatSwipeReplyRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const committingRef = useRef(false);

  const reset = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 220,
      mass: 0.75,
      useNativeDriver: true,
    }).start(() => {
      committingRef.current = false;
    });
  }, [translateX]);

  const commit = useCallback(() => {
    if (committingRef.current) return;
    committingRef.current = true;
    Animated.timing(translateX, {
      toValue: CHAT_REPLY_SWIPE_TRIGGER_DISTANCE,
      duration: 90,
      useNativeDriver: true,
    }).start(() => {
      onReply();
      reset();
    });
  }, [onReply, reset, translateX]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !disabled && shouldClaimReplySwipe(gesture.dx, gesture.dy),
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_event, gesture) => {
        translateX.setValue(clampReplySwipeDistance(gesture.dx));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (shouldCommitReplySwipe(gesture.dx, gesture.vx)) {
          commit();
          return;
        }
        reset();
      },
      onPanResponderTerminate: reset,
      onShouldBlockNativeResponder: () => false,
    }),
    [commit, disabled, reset, translateX],
  );

  const actionOpacity = translateX.interpolate({
    inputRange: [0, CHAT_REPLY_SWIPE_TRIGGER_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const actionScale = translateX.interpolate({
    inputRange: [0, CHAT_REPLY_SWIPE_TRIGGER_DISTANCE],
    outputRange: [0.72, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.swipeReplyRow}>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.swipeReplyAction,
          { opacity: actionOpacity, transform: [{ scale: actionScale }] },
        ]}
      >
        <View style={styles.swipeReplyActionIcon}>
          <MaterialCommunityIcons name="reply" size={18} color={iconColor} />
        </View>
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}
