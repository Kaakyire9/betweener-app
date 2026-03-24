import { Colors } from "@/constants/theme";
import { TRUST_LINKS, openSupportEmail } from "@/lib/trust-links";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MergedAccountScreen() {
  const { mergeCaseId, keptEmailHint, keptMethods } = useLocalSearchParams<{
    mergeCaseId?: string;
    keptEmailHint?: string;
    keptMethods?: string;
  }>();

  const parsedMethods =
    typeof keptMethods === "string" && keptMethods.trim().length > 0
      ? keptMethods
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      : [];

  const methodLabels = parsedMethods.map((method) => {
    switch (method) {
      case "google":
        return "Google";
      case "apple":
        return "Apple";
      case "email":
        return "Email";
      default:
        return method.charAt(0).toUpperCase() + method.slice(1);
    }
  });

  const guidanceLine =
    methodLabels.length === 0
      ? "Use the kept sign-in method to return to your account."
      : methodLabels.length === 1
        ? `Use ${methodLabels[0]} to sign back in to your kept account.`
        : `Use one of these sign-in methods to return to your kept account: ${methodLabels.join(", ")}.`;

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Sign out failed", error.message || "Unable to sign out right now.");
      return;
    }
    router.replace("/(auth)/welcome");
  };

  const handleContactSupport = async () => {
    const subject = "Betweener merged account help";
    const bodyLines = [
      "I signed in with a merged Betweener account and need help getting back into the kept account.",
      typeof mergeCaseId === "string" && mergeCaseId ? `Merge case: ${mergeCaseId}` : null,
      typeof keptEmailHint === "string" && keptEmailHint ? `Kept email hint shown: ${keptEmailHint}` : null,
      methodLabels.length > 0 ? `Kept sign-in methods shown: ${methodLabels.join(", ")}` : null,
    ].filter(Boolean);

    const opened = await openSupportEmail(subject, bodyLines.join("\n"));
    if (!opened) {
      Alert.alert("Support unavailable", `Email ${TRUST_LINKS.supportEmail} for help with this merged account.`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="account-switch-outline" size={34} color={Colors.light.tint} />
        </View>
        <Text style={styles.title}>Merged account</Text>
        <Text style={styles.body}>
          This sign-in method is attached to an older Betweener account that has already been merged.
        </Text>
        <Text style={styles.body}>{guidanceLine}</Text>
        {typeof keptEmailHint === "string" && keptEmailHint ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintLabel}>Kept account email hint</Text>
            <Text style={styles.hintValue}>{keptEmailHint}</Text>
          </View>
        ) : null}
        {methodLabels.length > 0 ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintLabel}>Kept sign-in methods</Text>
            <Text style={styles.hintValue}>{methodLabels.join(", ")}</Text>
          </View>
        ) : null}
        {typeof mergeCaseId === "string" && mergeCaseId ? (
          <Text style={styles.meta}>Merge case: {mergeCaseId}</Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={() => router.replace("/(auth)/welcome")}>
            <Text style={styles.primaryButtonText}>Back to sign in</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void handleSignOut()}>
            <Text style={styles.secondaryButtonText}>Sign out</Text>
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
    backgroundColor: "rgba(218, 165, 32, 0.12)",
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
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.outline,
    backgroundColor: Colors.light.backgroundSubtle,
  },
  secondaryButtonText: {
    color: Colors.light.text,
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
  },
  supportButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(218, 165, 32, 0.12)",
  },
  supportButtonText: {
    color: Colors.light.text,
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
  },
});
