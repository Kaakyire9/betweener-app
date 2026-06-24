import OfflineImage from '@/components/media/OfflineImage';
import type { ClosureRecommendation } from '@/lib/intents/closure-to-clarity';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type ClosureRecommendationCardProps = {
  recommendation: ClosureRecommendation;
  onViewProfile: () => void;
  onSendIntent: () => void;
};

const laneIcons = {
  similar_spark: 'creation-outline',
  better_timing: 'clock-check-outline',
  fresh_perspective: 'compass-outline',
} as const;

export default function ClosureRecommendationCard({
  recommendation,
  onViewProfile,
  onSendIntent,
}: ClosureRecommendationCardProps) {
  const title = recommendation.age
    ? `${recommendation.name}, ${recommendation.age}`
    : recommendation.name;
  const initial = recommendation.name.trim().charAt(0).toUpperCase() || 'B';

  return (
    <View style={styles.card}>
      <View style={styles.laneRow}>
        <MaterialCommunityIcons
          name={laneIcons[recommendation.lane]}
          size={16}
          color="#63D7D3"
        />
        <Text style={styles.lane}>{recommendation.laneLabel}</Text>
      </View>

      <Pressable onPress={onViewProfile} style={styles.profileRow}>
        {recommendation.avatarUrl ? (
          <OfflineImage uri={recommendation.avatarUrl} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.profileCopy}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {title}
            </Text>
            {recommendation.verified ? (
              <MaterialCommunityIcons name="check-decagram" size={16} color="#63D7D3" />
            ) : null}
          </View>
          {recommendation.location ? (
            <Text style={styles.location} numberOfLines={1}>
              {recommendation.location}
            </Text>
          ) : null}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(246,239,227,0.48)" />
      </Pressable>

      <View style={styles.reasons}>
        {recommendation.reasons.map((reason) => (
          <View key={reason} style={styles.reasonRow}>
            <View style={styles.reasonDot} />
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onViewProfile} style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]}>
          <Text style={styles.viewText}>View profile</Text>
        </Pressable>
        <Pressable onPress={onSendIntent} style={({ pressed }) => [styles.intentButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="message-text-outline" size={17} color="#061E22" />
          <Text style={styles.intentText}>Send Intent</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(9,42,45,0.82)',
    borderColor: 'rgba(99,215,211,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  laneRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  lane: {
    color: '#63D7D3',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    borderRadius: 8,
    height: 62,
    width: 62,
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(139,92,255,0.2)',
    borderRadius: 8,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  avatarInitial: {
    color: '#F6EFE3',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 25,
  },
  profileCopy: {
    flex: 1,
    marginLeft: 13,
    minWidth: 0,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  name: {
    color: '#F6EFE3',
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  location: {
    color: 'rgba(246,239,227,0.6)',
    fontSize: 13,
    marginTop: 5,
  },
  reasons: {
    gap: 8,
    marginTop: 15,
  },
  reasonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  reasonDot: {
    backgroundColor: '#8B5CFF',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  reasonText: {
    color: 'rgba(246,239,227,0.76)',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 17,
  },
  viewButton: {
    alignItems: 'center',
    borderColor: 'rgba(99,215,211,0.34)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  viewText: {
    color: '#F6EFE3',
    fontSize: 13,
    fontWeight: '700',
  },
  intentButton: {
    alignItems: 'center',
    backgroundColor: '#63D7D3',
    borderRadius: 8,
    flex: 1.2,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
  },
  intentText: {
    color: '#061E22',
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.76,
  },
});
