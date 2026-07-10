import Notice from "@/components/ui/Notice";
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
      <View style={styles.completeIcon}>
        <MaterialCommunityIcons name="check-decagram-outline" size={42} color={styles.tokens.accent.color} />
      </View>
      <Text style={styles.completeTitle}>Profile ready</Text>
      <Text style={styles.completeBody}>{subtitle}</Text>
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
