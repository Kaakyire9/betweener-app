import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, Text } from "react-native";

type Props = {
  visible: boolean;
  signingOut: boolean;
  styles: any;
  onClose: () => void;
  onSignOut: () => void;
};

export function PremiumOnboardingSignOutMenu({
  visible,
  signingOut,
  styles,
  onClose,
  onSignOut,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} accessibilityRole="button" accessibilityLabel="Close more options" onPress={onClose}>
        <Pressable style={styles.signOutSheet} accessibilityRole="menu">
          <Text style={styles.signOutSheetTitle}>More options</Text>
          <Pressable
            style={styles.signOutSheetAction}
            accessibilityRole="menuitem"
            onPress={onSignOut}
            disabled={signingOut}
          >
            <MaterialCommunityIcons name="logout" size={18} color={styles.tokens.ink.color} />
            <Text style={styles.signOutSheetActionText}>{signingOut ? "Signing out..." : "Sign out"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
