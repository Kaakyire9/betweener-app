import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

type GiftSenderCardProps = {
  senderAvatar?: string | null;
  senderName: string;
  senderMeta: string;
};

export default function GiftSenderCard({
  senderAvatar,
  senderName,
  senderMeta,
}: GiftSenderCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const safeSenderName = String(senderName || "").trim() || "Someone";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.045)"
            : "rgba(255,255,255,0.62)",
          borderColor: isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(15,23,42,0.06)",
        },
      ]}
    >
      <View style={styles.identity}>
        {senderAvatar ? (
          <Image source={{ uri: senderAvatar }} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatarFallback,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : `${theme.tint}16`,
              },
            ]}
          >
            <Text style={[styles.avatarFallbackText, { color: theme.text }]}>
              {safeSenderName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.copy}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {safeSenderName}
          </Text>
          <Text
            style={[styles.meta, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {senderMeta}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minWidth: 0,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 20,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  name: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 17,
    flexShrink: 1,
  },
  meta: {
    marginTop: 4,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11.5,
    flexShrink: 1,
  },
});
