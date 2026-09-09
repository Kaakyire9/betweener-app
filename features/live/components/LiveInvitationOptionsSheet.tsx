import { CalendarClock, ExternalLink, Pencil, Share2, X } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

function Option({
  icon,
  title,
  description,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.option}>
      <View style={styles.optionIcon}>{icon}</View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

export function LiveInvitationOptionsSheet({
  visible,
  isHost,
  onClose,
  onViewDetails,
  onEdit,
  onReschedule,
  onShare,
}: {
  visible: boolean;
  isHost: boolean;
  onClose: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onReschedule: () => void;
  onShare: () => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close invitation options"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{isHost ? 'HOST CONTROLS' : 'INVITATION OPTIONS'}</Text>
              <Text style={styles.title}>{isHost ? 'Manage your Live' : 'About this Live'}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <X size={20} color={visual.text} />
            </Pressable>
          </View>
          <View style={styles.content}>
            <Option
              icon={<ExternalLink size={18} color={visual.teal} />}
              title="View event details"
              description={isHost ? 'See reservations, preparation, and all host controls.' : 'See the schedule, reservations, and room details.'}
              onPress={onViewDetails}
            />
            <Option
              icon={<Share2 size={18} color={visual.teal} />}
              title="Share invitation"
              description="Send this Live invitation to someone you trust."
              onPress={onShare}
            />
            {isHost ? (
              <>
                <Option
                  icon={<Pencil size={18} color={visual.teal} />}
                  title="Edit invitation"
                  description="Refine the title, host note, poster, or room settings."
                  onPress={onEdit}
                />
                <Option
                  icon={<CalendarClock size={18} color={visual.teal} />}
                  title="Reschedule"
                  description="Choose a new time and ask saved guests to reconfirm."
                  onPress={onReschedule}
                />
              </>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,8,7,0.7)' },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 9, paddingBottom: 30, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: visual.borderStrong },
  header: { paddingHorizontal: 22, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: visual.text, fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surfaceSoft },
  content: { paddingHorizontal: 18, gap: 9 },
  option: { minHeight: 76, borderRadius: 20, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: visual.surfaceSoft, borderWidth: 1, borderColor: visual.border },
  optionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.tealSoft },
  optionCopy: { flex: 1 },
  optionTitle: { color: visual.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  optionDescription: { color: visual.textMuted, fontSize: 9, lineHeight: 14, marginTop: 3, fontFamily: 'Manrope_500Medium' },
});
