import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

type Props = {
  styles: any;
  isWelcomeStep: boolean;
  isGhanaWelcomeStep: boolean;
  stepKey: string;
  modeLabel: string;
  title: string;
  subtitle: string;
  ctaText: string;
  loading: boolean;
  profileCreated: boolean;
  primaryDisabled?: boolean;
  dark: boolean;
  body: ReactNode;
  onPrimaryPress: () => void;
};

export function PremiumOnboardingStepFrame({
  styles,
  isWelcomeStep,
  isGhanaWelcomeStep,
  stepKey,
  modeLabel,
  title,
  subtitle,
  ctaText,
  loading,
  profileCreated,
  primaryDisabled,
  dark,
  body,
  onPrimaryPress,
}: Props) {
  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isGhanaWelcomeStep && styles.welcomeScrollContent]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.eyebrow, isGhanaWelcomeStep && styles.welcomeEyebrow]}>
          {stepKey === "welcome" ? modeLabel : stepKey.replace(/_/g, " ").toUpperCase()}
        </Text>
        <Text accessibilityRole={isWelcomeStep ? "header" : undefined} style={[styles.title, isGhanaWelcomeStep && styles.welcomeTitle]}>
          {title}
        </Text>
        <Text style={[styles.subtitle, isGhanaWelcomeStep && styles.welcomeSubtitle]}>{subtitle}</Text>
        <View style={[styles.bodyCard, isWelcomeStep && styles.welcomeCard]}>{body}</View>
      </ScrollView>

      <View style={[styles.footer, isGhanaWelcomeStep && styles.welcomeFooter]}>
        <Pressable
          style={[
            styles.primaryButton,
            isGhanaWelcomeStep && styles.welcomePrimaryButton,
            (loading || profileCreated || primaryDisabled) && styles.primaryButtonDisabled,
          ]}
          onPress={onPrimaryPress}
          disabled={loading || profileCreated || primaryDisabled}
        >
          {loading ? (
            <ActivityIndicator color={dark ? "#071E22" : "#FFFFFF"} />
          ) : (
            <Text style={styles.primaryButtonText}>{profileCreated ? "Profile created" : ctaText}</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}
