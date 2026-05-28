import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { FlatList, Pressable, Text, View } from "react-native";

import { getProfileInitials, getProfilePlaceholderPalette } from "@/lib/profile-placeholders";

type NewMatch = {
  userId: string;
  profileId: string;
  name: string;
  avatar_url: string | null;
  isOnline: boolean;
  lastSeen: Date;
  age?: number | null;
  location?: string | null;
};

type ChatNewMatchesStripProps = {
  newMatches: NewMatch[];
  newMatchesLoading: boolean;
  onOpenNewMatch: (match: NewMatch) => void;
  styles: Record<string, any>;
};

export function ChatNewMatchesStrip({
  newMatches,
  newMatchesLoading,
  onOpenNewMatch,
  styles,
}: ChatNewMatchesStripProps) {
  if (newMatches.length === 0 && !newMatchesLoading) return null;

  return (
    <View style={styles.newMatchesSection}>
      <View style={styles.newMatchesTitleRow}>
        <Text style={styles.newMatchesTitle}>New matches</Text>
        <Text style={styles.newMatchesSubtitle}>
          {newMatchesLoading ? 'Loading...' : `${newMatches.length} waiting for the first hello`}
        </Text>
      </View>

      {newMatches.length === 0 ? null : (
        <FlatList
          data={newMatches}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.newMatchesList}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onOpenNewMatch(item)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }, styles.newMatchCard]}
            >
              {item.avatar_url ? (
                <ExpoImage
                  source={{ uri: item.avatar_url }}
                  style={styles.newMatchAvatar}
                  cachePolicy="disk"
                  contentFit="cover"
                  transition={0}
                />
              ) : (
                <LinearGradient
                  colors={[
                    getProfilePlaceholderPalette(item.profileId || item.name).start,
                    getProfilePlaceholderPalette(item.profileId || item.name).end,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.newMatchAvatar, styles.avatarFallback]}
                >
                  <Text style={styles.avatarFallbackText}>{getProfileInitials(item.name)}</Text>
                </LinearGradient>
              )}
              <Text numberOfLines={1} style={styles.newMatchName}>
                {item.name}
              </Text>
              {item.location ? (
                <Text numberOfLines={1} style={styles.newMatchMeta}>
                  {item.location}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
