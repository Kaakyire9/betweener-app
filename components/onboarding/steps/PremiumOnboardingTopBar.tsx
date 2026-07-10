import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type Props = {
  styles: any;
  stepIndex: number;
  stepsLength: number;
  isGhanaWelcomeStep: boolean;
  signingOut: boolean;
  onBack: () => void;
  onMorePress: () => void;
  onSignOut: () => void;
};

export function PremiumOnboardingTopBar({
  styles,
  stepIndex,
  stepsLength,
  isGhanaWelcomeStep,
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
      {isGhanaWelcomeStep ? (
        <View style={styles.stepMetaPlaceholder} />
      ) : (
        <Text style={styles.stepMeta}>STEP {stepIndex + 1} OF {stepsLength}</Text>
      )}
      {isGhanaWelcomeStep ? (
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
