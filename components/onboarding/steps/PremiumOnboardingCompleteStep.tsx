import Notice from "@/components/ui/Notice";
import { AnimatedCompletionPortal } from "@/components/onboarding/AnimatedCompletionPortal";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

type Props = {
  subtitle: string;
  saveNetworkError: string | null;
  loading: boolean;
  message: string;
  onRetry: () => void;
  styles: any;
};

export function PremiumOnboardingCompleteStep({
  subtitle,
  saveNetworkError,
  loading,
  message,
  onRetry,
  styles,
}: Props) {
  return (
    <View style={styles.completeCard}>
      <View style={styles.completeIllustrationWrap}>
        <AnimatedCompletionPortal size={260} />
        <View style={styles.completeReadyBadge}>
          <MaterialCommunityIcons name="check-decagram" size={16} color="#FFFFFF" />
          <Text style={styles.completeReadyBadgeText}>PROFILE COMPLETE</Text>
        </View>
      </View>
      <Text style={styles.completeTitle}>Your world is ready</Text>
      <Text style={styles.completeBody}>{subtitle}</Text>
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
