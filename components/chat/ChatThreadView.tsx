import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Presentational root for a chat thread; receives no chat state or side effects. */
export const ChatThreadView = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) => <SafeAreaView style={style}>{children}</SafeAreaView>;
