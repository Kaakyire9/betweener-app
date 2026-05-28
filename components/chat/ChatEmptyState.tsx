import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

type EmptyTheme = {
  background: string;
  backgroundSubtle: string;
  text: string;
  tint: string;
  accent: string;
};

type ChatEmptyStateProps = {
  activeTab: 'all' | 'unread' | 'pinned' | 'archived';
  styles: Record<string, any>;
  theme: EmptyTheme;
  isDark: boolean;
  withAlpha: (hex: string, alpha: number) => string;
  onExplore: () => void;
};

export function ChatEmptyState({
  activeTab,
  styles,
  theme,
  isDark,
  withAlpha,
  onExplore,
}: ChatEmptyStateProps) {
  return (
    <ScrollView
      style={styles.emptyStateScroll}
      contentContainerStyle={styles.emptyStateContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <View style={styles.emptyState}>
        <View style={styles.emptyHero}>
          <View style={styles.emptyHeroGlowLeft} />
          <View style={styles.emptyHeroGlowRight} />
          <LinearGradient
            colors={[
              withAlpha(theme.background, isDark ? 0.98 : 0.94),
              withAlpha(theme.backgroundSubtle, isDark ? 0.9 : 0.98),
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyHeroPanel}
          >
            <LinearGradient
              colors={[
                withAlpha(theme.tint, isDark ? 0.24 : 0.18),
                withAlpha(theme.accent, isDark ? 0.24 : 0.16),
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyHeroBadge}
            >
              <MaterialCommunityIcons name="message-text-outline" size={30} color={theme.text} />
            </LinearGradient>
            <View style={[styles.emptyHeroOrb, styles.emptyHeroOrbLeft]}>
              <MaterialCommunityIcons name="heart-outline" size={16} color={theme.tint} />
            </View>
            <View style={[styles.emptyHeroOrb, styles.emptyHeroOrbRight]}>
              <MaterialCommunityIcons name="coffee-outline" size={16} color={theme.accent} />
            </View>
            <Text style={styles.emptyHeroKicker}>Private lounge</Text>
            <Text style={styles.emptyHeroLine}>A thoughtful hello starts here.</Text>
          </LinearGradient>
        </View>
        <Text style={styles.emptyStateTitle}>
          {activeTab === 'archived' ? 'No archived chats yet' : 'No conversations yet, but the room is ready'}
        </Text>
        <Text style={styles.emptyStateText}>
          {activeTab === 'archived'
            ? 'Archived chats will rest here until you bring them back into your main lounge.'
            : 'Match with someone who feels aligned, then open with something specific enough to be memorable.'}
        </Text>
        <View style={styles.emptyHighlights}>
          <View style={styles.emptyHighlightCard}>
            <MaterialCommunityIcons name="message-text-outline" size={18} color={theme.tint} />
            <Text style={styles.emptyHighlightTitle}>Better first messages</Text>
            <Text style={styles.emptyHighlightText}>Reference their vibe, not just their looks.</Text>
          </View>
          <View style={styles.emptyHighlightCard}>
            <MaterialCommunityIcons name="star-four-points" size={18} color={theme.accent} />
            <Text style={styles.emptyHighlightTitle}>Premium energy</Text>
            <Text style={styles.emptyHighlightText}>Reply early when a strong match lands.</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.exploreButton} onPress={onExplore}>
          <MaterialCommunityIcons name="compass" size={20} color="#FFFFFF" />
          <Text style={styles.exploreButtonText}>Explore Vibes</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
