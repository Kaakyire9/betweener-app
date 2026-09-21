import Notice from "@/components/ui/Notice";
import { AnimatedCompletionPortal } from "@/components/onboarding/AnimatedCompletionPortal";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";

type Props = {
  saveNetworkError: string | null;
  loading: boolean;
  profileCreated: boolean;
  avatarUri?: string | null;
  firstName?: string | null;
  message: string;
  onRetry: () => void;
  styles: any;
};

export function PremiumOnboardingCompleteStep({
  saveNetworkError,
  loading,
  profileCreated,
  avatarUri,
  firstName,
  message,
  onRetry,
  styles,
}: Props) {
  return (
    <View style={styles.completeCard}>
      <View style={styles.completeIllustrationWrap}>
        <AnimatedCompletionPortal
          avatarUri={avatarUri}
          celebrating={profileCreated}
          size={260}
        />
        <Animated.View
          key={profileCreated ? "profile-complete" : "ready-to-create"}
          entering={profileCreated ? ZoomIn.springify().damping(13) : undefined}
          style={styles.completeReadyBadge}
        >
          <MaterialCommunityIcons
            name={profileCreated ? "creation" : "check-decagram"}
            size={16}
            color="#FFFFFF"
          />
          <Text style={styles.completeReadyBadgeText}>
            {profileCreated ? "PROFILE COMPLETE" : "READY TO CREATE"}
          </Text>
        </Animated.View>
      </View>
      <Animated.View
        key={profileCreated ? "complete-copy" : "ready-copy"}
        entering={FadeInDown.delay(profileCreated ? 180 : 0).duration(420)}
        style={{ alignItems: "center" }}
      >
        <Text style={styles.completeTitle}>
          {profileCreated
            ? `Your world is ready${firstName ? `, ${firstName}` : ""}`
            : "Ready when you are"}
        </Text>
        <Text style={styles.completeBody}>
          {profileCreated
            ? "Your story is live. Opening the door to Vibes…"
            : "We'll securely check and create your profile when you continue."}
        </Text>
      </Animated.View>
      <View style={styles.completeSignalsRow}>
        <View style={styles.completeSignalPill}><MaterialCommunityIcons name="shield-check-outline" size={15} color={styles.tokens.accent.color} /><Text style={styles.completeSignalText}>Private by design</Text></View>
        <View style={styles.completeSignalPill}><MaterialCommunityIcons name="tune-variant" size={15} color={styles.tokens.accent.color} /><Text style={styles.completeSignalText}>Yours to refine</Text></View>
      </View>
      {saveNetworkError ? (
        <Notice
          title="No connection"
          message={saveNetworkError}
          actionLabel={loading ? "Saving..." : "Retry"}
          onAction={loading ? undefined : onRetry}
        />
      ) : null}
      {message ? <Text style={styles.messageText}>{message}</Text> : null}
    </View>
  );
}
