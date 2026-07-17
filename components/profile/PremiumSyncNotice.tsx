import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type ThemeLike = {
  background: string;
  backgroundSubtle: string;
  text: string;
  textMuted: string;
  tint: string;
  danger: string;
  outline: string;
};

type Props = {
  theme: ThemeLike;
  isDark: boolean;
  title: string;
  message: string;
  failedCount: number;
  pendingCount: number;
  onPress: () => void;
};

export default function PremiumSyncNotice({
  theme,
  isDark,
  title,
  message,
  failedCount,
  pendingCount,
  onPress,
}: Props) {
  const isFailed = failedCount > 0;
  const accent = isFailed ? theme.danger : theme.tint;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundSubtle,
          borderColor: isFailed ? `${theme.danger}33` : theme.outline,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: isFailed
              ? `${theme.danger}14`
              : isDark
                ? 'rgba(46,214,194,0.12)'
                : `${theme.tint}14`,
            borderColor: isFailed ? `${theme.danger}28` : `${theme.tint}22`,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={isFailed ? 'alert-circle-outline' : 'cloud-upload-outline'}
          size={16}
          color={accent}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {failedCount > 0
            ? `${failedCount} failed${pendingCount > 0 ? ` • ${pendingCount} queued` : ''}`
            : `${pendingCount} queued`}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        style={[styles.button, { borderColor: theme.outline, backgroundColor: theme.background }]}
      >
        <Text style={[styles.buttonText, { color: theme.tint }]}>
          {isFailed ? 'Retry' : 'Open'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 13.5,
    fontFamily: 'Manrope_800ExtraBold',
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_500Medium',
  },
  meta: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
  },
  button: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: {
    fontSize: 11.5,
    fontFamily: 'Manrope_800ExtraBold',
  },
});
