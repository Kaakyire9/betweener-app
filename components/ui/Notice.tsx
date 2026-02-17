import AppText from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
};

export default function Notice({ title, message, actionLabel, onAction, icon = "wifi-off" }: Props) {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? "light"];
  const isDark = (scheme ?? "light") === "dark";

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)",
          borderColor: theme.outline,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
          <MaterialCommunityIcons name={icon as any} size={18} color={theme.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{title}</AppText>
          {message ? (
            <AppText muted variant="caption" style={{ marginTop: 2 }}>
              {message}
            </AppText>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={[styles.action, { borderColor: theme.outline }]}>
            <AppText variant="pill" style={{ color: theme.tint }}>
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  action: {
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});

