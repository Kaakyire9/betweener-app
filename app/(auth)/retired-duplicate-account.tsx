import { Colors } from "@/constants/theme";
import { TRUST_LINKS, openSupportEmail } from "@/lib/trust-links";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const methodLabel = (value?: string | null) => {
  switch (String(value || "").trim().toLowerCase()) {
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    case "magic_link":
      return "Email link";
    case "email":
      return "Email";
    default:
      return "your older sign-in method";
  }
};

export default function RetiredDuplicateAccountScreen() {
  const { method, email } = useLocalSearchParams<{
    method?: string;
    email?: string;
  }>();

  const retiredMethodLabel = methodLabel(method);
  const retiredEmail = typeof email === "string" && email.trim() ? email.trim() : null;

  const handleContactSupport = async () => {
    const subject = "Betweener retired duplicate account help";
    const body = [
      "I signed in with a Betweener account that was already retired after recovery.",
      retiredMethodLabel ? `Retired sign-in method: ${retiredMethodLabel}` : null,
      retiredEmail ? `Retired sign-in email: ${retiredEmail}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const opened = await openSupportEmail(subject, body);
    if (!opened) {
      router.replace("/(auth)/welcome");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="account-lock-outline" size={34} color={Colors.light.tint} />
        </View>
        <Text style={styles.title}>Use your restored account</Text>
        <Text style={styles.body}>
          This sign-in belongs to a newer duplicate Betweener account that has already been retired.
        </Text>
        <Text style={styles.body}>
          We already restored your older account successfully. Sign in again using the older account instead of this one.
        </Text>
        <View style={styles.hintCard}>
          <Text style={styles.hintLabel}>Retired sign-in method</Text>
          <Text style={styles.hintValue}>{retiredMethodLabel}</Text>
        </View>
        {retiredEmail ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintLabel}>Retired sign-in email</Text>
            <Text style={styles.hintValue}>{retiredEmail}</Text>
          </View>
        ) : null}
        <Text style={styles.meta}>
          If you are unsure which older account to use, contact {TRUST_LINKS.supportEmail}.
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={() => router.replace("/(auth)/welcome")}>
            <Text style={styles.primaryButtonText}>Back to sign in</Text>
          </Pressable>
          <Pressable style={styles.supportButton} onPress={() => void handleContactSupport()}>
            <Text style={styles.supportButtonText}>Email support</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  card: {
    borderRadius: 24,
    padding: 24,
    gap: 14,
    backgroundColor: Colors.light.backgroundSubtle,
    borderWidth: 1,
    borderColor: Colors.light.outline,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 184, 212, 0.12)",
  },
  title: {
    color: Colors.light.text,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  body: {
    color: Colors.light.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Manrope_500Medium",
  },
  hintCard: {
    borderRadius: 16,
    padding: 14,
    gap: 4,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.outline,
  },
  hintLabel: {
    color: Colors.light.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textTransform: "uppercase",
    fontFamily: "Manrope_700Bold",
  },
  hintValue: {
    color: Colors.light.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Archivo_700Bold",
  },
  meta: {
    color: Colors.light.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "SpaceMono",
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: Colors.light.tint,
  },
  primaryButtonText: {
    color: Colors.light.background,
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
  },
  supportButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(20, 184, 212, 0.12)",
  },
  supportButtonText: {
    color: Colors.light.text,
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
  },
});
