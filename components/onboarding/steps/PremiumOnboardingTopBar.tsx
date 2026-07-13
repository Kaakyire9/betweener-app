import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type Props = {
  styles: any;
  stepIndex: number;
  stepsLength: number;
  signingOut: boolean;
  onBack: () => void;
  onMorePress: () => void;
  onSignOut: () => void;
};

export function PremiumOnboardingTopBar({
  styles,
  stepIndex,
  stepsLength,
  signingOut,
  onBack,
  onMorePress,
  onSignOut,
}: Props) {
  return (
    <View style={styles.topBar}>
      {stepIndex > 0 ? (
        <Pressable style={styles.backButton} onPress={onBack} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={21} color={styles.tokens.ink.color} />
        </Pressable>
      ) : (
        <View style={styles.backButtonPlaceholder} />
      )}
      {stepIndex === 0 ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Step 1 of ${stepsLength}`}
          style={styles.welcomeJourneyPill}
        >
          <View style={styles.welcomeJourneyDot} />
          <Text style={styles.welcomeJourneyText}>01 / {String(stepsLength).padStart(2, "0")}</Text>
        </View>
      ) : (
        <Text style={styles.stepMeta}>STEP {stepIndex + 1} OF {stepsLength}</Text>
      )}
      {stepIndex === 0 ? (
        <Pressable
          style={styles.moreButton}
          accessibilityRole="button"
          accessibilityLabel="More options"
          onPress={onMorePress}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={22} color={styles.tokens.ink.color} />
        </Pressable>
      ) : (
        <Pressable style={styles.skipButton} onPress={onSignOut} disabled={signingOut}>
          <Text style={styles.skipText}>{signingOut ? "..." : "Sign out"}</Text>
        </Pressable>
      )}
    </View>
  );
}
