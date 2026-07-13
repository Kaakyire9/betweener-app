import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  FadeInLeft,
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

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
  transitionDirection: "forward" | "back";
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
  transitionDirection,
}: Props) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const welcomeButtonScale = useSharedValue(1);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const entering = (transitionDirection === "forward" ? FadeInRight : FadeInLeft)
    .duration(320)
    .withInitialValues({ transform: [{ translateX: transitionDirection === "forward" ? 18 : -18 }, { scale: 0.992 }] })
    .reduceMotion(ReduceMotion.System);
  const exiting = (transitionDirection === "forward" ? FadeOutLeft : FadeOutRight)
    .duration(180)
    .reduceMotion(ReduceMotion.System);
  const welcomeButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: welcomeButtonScale.value }] }));
  const disabled = loading || profileCreated || Boolean(primaryDisabled);

  const primaryButton = (
    <Animated.View style={[isWelcomeStep && styles.welcomeInlineButtonWrap, isWelcomeStep && welcomeButtonStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isWelcomeStep ? "Shape my world. Begin onboarding." : ctaText}
        accessibilityState={{ disabled }}
        style={[
          styles.primaryButton,
          isWelcomeStep && styles.welcomePrimaryButton,
          disabled && styles.primaryButtonDisabled,
        ]}
        onPress={onPrimaryPress}
        onPressIn={() => {
          if (isWelcomeStep) welcomeButtonScale.value = withTiming(0.985, { duration: 110 });
        }}
        onPressOut={() => {
          if (isWelcomeStep) welcomeButtonScale.value = withTiming(1, { duration: 120 });
        }}
        disabled={disabled}
      >
        {isGhanaWelcomeStep ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={["#8B5CFF", "#7C5CFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.welcomeButtonGradient}
            />
            <View pointerEvents="none" style={styles.welcomeButtonTopHighlight} />
          </>
        ) : null}
        {loading ? (
          <ActivityIndicator color={dark ? "#071E22" : "#FFFFFF"} />
        ) : (
          <View style={styles.primaryButtonContent}>
            <Text style={[styles.primaryButtonText, disabled && styles.primaryButtonTextDisabled]}>
              {profileCreated ? "Profile created" : ctaText}
            </Text>
            {isWelcomeStep ? <MaterialCommunityIcons name="arrow-right" size={19} color={dark ? "#071E22" : "#FFFFFF"} /> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );

  const welcomeAssurance = (
    <View style={styles.welcomeFooterAssurance}>
      <MaterialCommunityIcons name="shield-check-outline" size={13} color={styles.tokens.muted.color} importantForAccessibility="no" />
      <Text style={styles.welcomeFooterAssuranceText}>About 2 minutes · You can change anything later</Text>
    </View>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWelcomeStep && styles.welcomeScrollContent,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <Animated.View key={stepKey} entering={entering} exiting={exiting}>
          <Text style={[styles.eyebrow, isWelcomeStep && styles.welcomeEyebrow]}>
            {stepKey === "welcome" ? modeLabel : stepKey.replace(/_/g, " ").toUpperCase()}
          </Text>
          <Text
            accessibilityRole={isWelcomeStep ? "header" : undefined}
            style={[
              styles.title,
              stepKey === "current_location" && styles.locationStepTitle,
              isWelcomeStep && styles.welcomeTitle,
            ]}
          >
            {isGhanaWelcomeStep ? "Your story. Your\nroots. A new\nconnection." : title}
          </Text>
          <Text
            style={[
              styles.subtitle,
              stepKey === "current_location" && styles.locationStepSubtitle,
              isWelcomeStep && styles.welcomeSubtitle,
            ]}
          >
            {subtitle}
          </Text>
          <View style={[styles.bodyCard, isWelcomeStep && styles.welcomeCard]}>{body}</View>
          {isWelcomeStep ? (
            <Animated.View
              entering={FadeInDown.delay(520).duration(180).reduceMotion(ReduceMotion.System)}
              style={styles.welcomeInlineAction}
            >
              {primaryButton}
              {welcomeAssurance}
            </Animated.View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {!isWelcomeStep ? (
        <View style={styles.footer}>
          {primaryButton}
        </View>
      ) : null}
    </>
  );
}
