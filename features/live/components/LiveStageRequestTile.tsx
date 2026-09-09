import { Check, Plus, UserRoundPlus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

export type LiveStageRequestSeat = {
  state: 'available' | 'pending';
  seatCount: number;
  disabled?: boolean;
  onPress: () => void;
};

/** An intentional empty stage seat: request and withdrawal live where the seat will appear. */
export function LiveStageRequestTile({
  request,
  seatIndex,
}: {
  request: LiveStageRequestSeat;
  seatIndex: number;
}) {
  const pending = request.state === 'pending' && seatIndex === 0;
  const passiveOpenSeat = request.state === 'pending' && seatIndex > 0;
  const disabled = request.disabled || passiveOpenSeat;
  return (
    <Pressable
      accessibilityHint={pending ? 'Withdraws your pending stage request' : passiveOpenSeat ? 'Another guest seat remains open' : 'Privately asks the host for a stage seat'}
      accessibilityLabel={pending ? 'Stage request sent' : passiveOpenSeat ? 'Open stage seat' : 'Request a stage seat'}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: pending }}
      disabled={disabled}
      onPress={request.onPress}
      style={({ pressed }) => [
        styles.root,
        pending && styles.pendingRoot,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.orbit, pending && styles.orbitPending]}>
        <View style={[styles.innerOrbit, pending && styles.innerOrbitPending]}>
          {pending
            ? <Check size={24} color={LIVE_VISUAL.color.teal} strokeWidth={2.5} />
            : <Plus size={28} color={LIVE_VISUAL.color.teal} strokeWidth={1.8} />}
        </View>
      </View>
      <View style={styles.copy}>
        <View style={styles.labelRow}>
          <UserRoundPlus size={14} color={LIVE_VISUAL.color.teal} />
          <Text style={styles.title}>{pending ? 'Request sent' : passiveOpenSeat ? 'Open seat' : 'Request a seat'}</Text>
        </View>
        <Text style={styles.description}>
          {pending ? 'Tap to withdraw' : passiveOpenSeat ? 'Host approval required' : 'Join the conversation'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: '#0C1C19',
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
    zIndex: 3,
    elevation: 3,
  },
  pendingRoot: { backgroundColor: '#17251F' },
  orbit: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LIVE_VISUAL.color.borderStrong, backgroundColor: LIVE_VISUAL.color.tealSoft },
  orbitPending: { borderColor: LIVE_VISUAL.color.teal, backgroundColor: LIVE_VISUAL.color.tealSoft },
  innerOrbit: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LIVE_VISUAL.color.borderStrong, backgroundColor: '#10241F' },
  innerOrbitPending: { backgroundColor: LIVE_VISUAL.color.tealSoft },
  copy: { alignItems: 'center', gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: '#FFF7EC', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  description: { color: '#91A59F', fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
});
