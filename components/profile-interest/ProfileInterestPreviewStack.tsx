import OfflineImage from '@/components/media/OfflineImage';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

type PreviewPerson = {
  name: string;
  avatar_url?: string | null;
};

type Props = {
  people: PreviewPerson[];
  accent: string;
  locked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  totalCount?: number;
};

const STACK_SIZE = {
  sm: {
    avatarSize: 34,
    offset: 20,
    radius: 17,
    initialSize: 12,
    ctaFontSize: 10,
    ctaHeight: 24,
  },
  md: {
    avatarSize: 42,
    offset: 24,
    radius: 21,
    initialSize: 15,
    ctaFontSize: 11,
    ctaHeight: 28,
  },
  lg: {
    avatarSize: 56,
    offset: 32,
    radius: 28,
    initialSize: 18,
    ctaFontSize: 12,
    ctaHeight: 32,
  },
} as const;

export default function ProfileInterestPreviewStack({
  people,
  accent,
  locked = true,
  size = 'sm',
  totalCount,
}: Props) {
  const config = STACK_SIZE[size];
  const resolvedTotalCount = Math.max(totalCount ?? people.length, people.length);
  const showSeeAll = resolvedTotalCount > 4;
  const visiblePeople = people.slice(0, showSeeAll ? 3 : 4);
  const stackWidth =
    visiblePeople.length > 0 ? config.avatarSize + Math.max(visiblePeople.length - 1, 0) * config.offset : config.avatarSize;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.stack, { width: stackWidth, height: config.avatarSize }]}>
        {visiblePeople.length ? (
          visiblePeople.map((person, index) => {
            const initial = person.name.trim().charAt(0).toUpperCase() || 'B';
            return (
              <View
                key={`${person.name}-${index}`}
                style={[
                  styles.avatarFrame,
                  {
                    width: config.avatarSize,
                    height: config.avatarSize,
                    left: index * config.offset,
                    borderRadius: config.radius,
                    zIndex: visiblePeople.length - index,
                    borderColor: `${accent}${size === 'sm' ? '30' : '3A'}`,
                  },
                ]}
              >
                {person.avatar_url ? (
                  <OfflineImage
                    uri={person.avatar_url}
                    blurRadius={locked ? 18 : 8}
                    style={styles.avatarImage}
                  />
                ) : (
                  <LinearGradientSafe
                    colors={['rgba(12,119,120,0.92)', 'rgba(25,35,52,0.92)']}
                    start={[0, 0]}
                    end={[1, 1]}
                    style={styles.fallbackFill}
                  >
                    <Text style={[styles.initial, { fontSize: config.initialSize }]}>{initial}</Text>
                  </LinearGradientSafe>
                )}
                <LinearGradientSafe
                  colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.03)', 'rgba(5,14,20,0.22)']}
                  start={[0, 0]}
                  end={[1, 1]}
                  style={styles.avatarTint}
                />
                <View style={styles.scrim} />
              </View>
            );
          })
        ) : (
          <View
            style={[
              styles.avatarFrame,
              styles.placeholderAvatar,
              {
                width: config.avatarSize,
                height: config.avatarSize,
                borderRadius: config.radius,
                borderColor: `${accent}${size === 'sm' ? '30' : '3A'}`,
              },
            ]}
          >
            <MaterialCommunityIcons name="account-search-outline" size={size === 'sm' ? 16 : 20} color={accent} />
          </View>
        )}
        </View>
        {showSeeAll ? (
          <View
            style={[
              styles.ctaPill,
              {
                minHeight: config.ctaHeight,
                backgroundColor: `${accent}16`,
                borderColor: `${accent}2D`,
              },
            ]}
          >
            <Text style={[styles.ctaText, { color: accent, fontSize: config.ctaFontSize }]}>See all</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stack: {
    position: 'relative',
  },
  avatarFrame: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  placeholderAvatar: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fallbackFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_700Bold',
  },
  avatarTint: {
    ...StyleSheet.absoluteFill,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 18, 24, 0.12)',
  },
  ctaPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  ctaText: {
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
});
