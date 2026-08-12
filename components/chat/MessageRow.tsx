import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

type MessageRowProps = {
  showDateSeparator: boolean;
  dateLabel: string;
  styles: {
    daySeparator: unknown;
    daySeparatorText: unknown;
  };
  children: ReactNode;
};

/** The non-interactive layout around an individual chat bubble. */
export const MessageRow = ({
  showDateSeparator,
  dateLabel,
  styles,
  children,
}: MessageRowProps) => (
  <View>
    {showDateSeparator ? (
      <View style={styles.daySeparator as any}>
        <Text style={styles.daySeparatorText as any}>{dateLabel}</Text>
      </View>
    ) : null}
    {children}
  </View>
);
