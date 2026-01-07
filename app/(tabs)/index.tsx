import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  // Mock data - in a real app, this would come from your state management
  const [profileCompletion] = useState(85);
  const [newMatchesToday] = useState(3);
  const [profileViews] = useState(42);
  const [likesReceived] = useState(18);
  const [conversationStreak] = useState(4);
  const [boostsLeft] = useState(2);
  const [isOnline] = useState(true);

  const recentMatches = [
    { id: 1, name: "Sarah", photo: "👩‍🦰", unread: 2, lastMessage: "Hey! How's your day?" },
    { id: 2, name: "Emma", photo: "👱‍♀️", unread: 0, lastMessage: "That sounds fun!" },
    { id: 3, name: "Maya", photo: "👩‍🦱", unread: 1, lastMessage: "Let's meet up!" },
  ];

  const badges = [
    { name: "First Match", icon: "🎉", earned: true },
    { name: "Chatterbox", icon: "💬", earned: true },
    { name: "Consistent", icon: "❤️", earned: false },
  ];

  const ProfileSnapshotCard = () => (
    <View style={styles.card}>
      <View style={styles.profileHeader}>
        <View style={styles.profilePhotoContainer}>
          <Image
            source={require("@/assets/images/circle-logo.png")}
            style={styles.profilePhoto}
          />
          <View style={[styles.onlineRing, { borderColor: isOnline ? theme.secondary : theme.textMuted }]} />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>Alex Johnson</Text>
          <Text style={styles.lastActive}>Active now</Text>
          <View style={styles.moodContainer}>
            <Text style={styles.moodSticker}>😊</Text>
            <Text style={styles.moodText}>Happy vibes</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.completionBar}>
        <View style={styles.completionHeader}>
          <Text style={styles.completionText}>Profile: {profileCompletion}%</Text>
          <Text style={styles.completionSuggestion}>Add 1 more photo for +20% visibility</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${profileCompletion}%` }]} />
        </View>
      </View>
    </View>
  );

  const MatchesOverviewCard = () => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>New Matches Today</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{newMatchesToday}</Text>
        </View>
      </View>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.matchesScroll}>
        {recentMatches.map((match) => (
          <View key={match.id} style={styles.matchItem}>
            <View style={styles.matchPhotoContainer}>
              <Text style={styles.matchPhoto}>{match.photo}</Text>
              {match.unread > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{match.unread}</Text>
                </View>
              )}
            </View>
            <Text style={styles.matchName}>{match.name}</Text>
            <View style={styles.matchActions}>
              <TouchableOpacity style={styles.actionBtn}>
                <MaterialCommunityIcons name="message" size={16} color={Colors.light.background} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn}>
                <MaterialCommunityIcons name="heart" size={16} color={theme.tint} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const MessagingSnapshotCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Recent Conversations</Text>
      {recentMatches.slice(0, 3).map((match) => (
        <TouchableOpacity key={match.id} style={styles.conversationItem}>
          <Text style={styles.conversationPhoto}>{match.photo}</Text>
          <View style={styles.conversationInfo}>
            <View style={styles.conversationHeader}>
              <Text style={styles.conversationName}>{match.name}</Text>
              <View style={styles.statusIndicator}>
                <Text style={styles.statusIcon}>✅</Text>
              </View>
            </View>
            <Text style={styles.lastMessage}>{match.lastMessage}</Text>
          </View>
          {match.unread > 0 && (
            <View style={styles.unreadDot} />
          )}
        </TouchableOpacity>
      ))}
      
      <View style={styles.moodStickersBar}>
        <Text style={styles.moodStickersTitle}>Quick Send:</Text>
        <View style={styles.moodStickers}>
          {["😊", "😍", "🔥", "💕", "😂"].map((sticker, index) => (
            <TouchableOpacity key={index} style={styles.moodStickerBtn}>
              <Text style={styles.moodStickerText}>{sticker}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const EngagementInsightsCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your Week in Numbers</Text>
      <View style={styles.insightsGrid}>
        <View style={styles.insightItem}>
          <MaterialCommunityIcons name="eye" size={24} color={theme.secondary} />
          <Text style={styles.insightNumber}>{profileViews}</Text>
          <Text style={styles.insightLabel}>Profile Views</Text>
        </View>
        <View style={styles.insightItem}>
          <MaterialCommunityIcons name="heart" size={24} color={theme.tint} />
          <Text style={styles.insightNumber}>{likesReceived}</Text>
          <Text style={styles.insightLabel}>Likes Received</Text>
        </View>
        <View style={styles.insightItem}>
          <MaterialCommunityIcons name="fire" size={24} color={theme.accent} />
          <Text style={styles.insightNumber}>{conversationStreak}</Text>
          <Text style={styles.insightLabel}>Day Streak</Text>
        </View>
      </View>
      <View style={styles.streakHighlight}>
        <Text style={styles.streakText}>🔥 You've messaged Sarah 4 days in a row!</Text>
      </View>
    </View>
  );

  const DiscoverSection = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Discover New Matches</Text>
      <View style={styles.discoverCategories}>
        <TouchableOpacity style={styles.discoverCategory}>
          <MaterialCommunityIcons name="map-marker" size={20} color={theme.secondary} />
          <Text style={styles.categoryText}>Most Active Near You</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.discoverCategory}>
          <MaterialCommunityIcons name="star" size={20} color={theme.accent} />
          <Text style={styles.categoryText}>New Users</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.discoverCategory}>
          <MaterialCommunityIcons name="account-group" size={20} color={theme.tint} />
          <Text style={styles.categoryText}>Similar Interests</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity 
        style={styles.swipeButton}
        onPress={() => router.push("/(tabs)/explore")}
      >
        <View style={styles.swipeButtonGradient}>
          <MaterialCommunityIcons name="cards-heart" size={24} color={Colors.light.background} />
          <Text style={styles.swipeButtonText}>Start Swiping</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const BoostsCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Boosts & Features</Text>
      <View style={styles.boostInfo}>
        <View style={styles.boostItem}>
          <MaterialCommunityIcons name="rocket" size={24} color={theme.accent} />
          <Text style={styles.boostText}>{boostsLeft} Free Boosts Left</Text>
        </View>
        <TouchableOpacity style={styles.superLikeBtn}>
          <View style={styles.superLikeGradient}>
            <MaterialCommunityIcons name="star" size={20} color={Colors.light.background} />
            <Text style={styles.superLikeText}>Try Super Like</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  const SafetyCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Safety & Wellness</Text>
      <View style={styles.safetyTip}>
        <MaterialCommunityIcons name="lightbulb" size={20} color={theme.accent} />
        <Text style={styles.safetyText}>💡 Never share financial info with matches</Text>
      </View>
      <View style={styles.safetyActions}>
        <TouchableOpacity style={styles.safetyBtn}>
          <MaterialCommunityIcons name="shield-check" size={16} color={theme.secondary} />
          <Text style={styles.safetyBtnText}>Available</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.safetyBtn}>
          <MaterialCommunityIcons name="block-helper" size={16} color={theme.tint} />
          <Text style={styles.safetyBtnText}>Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const GamificationCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your Achievements</Text>
      <View style={styles.badgesContainer}>
        {badges.map((badge, index) => (
          <View key={index} style={[styles.badgeItem, { opacity: badge.earned ? 1 : 0.5 }]}>
            <Text style={styles.badgeIcon}>{badge.icon}</Text>
            <Text style={styles.badgeName}>{badge.name}</Text>
            {badge.earned && <MaterialCommunityIcons name="check-circle" size={16} color={theme.secondary} />}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.welcomeText}>Good morning! ☀️</Text>
            <Text style={styles.headerTitle}>Your Dashboard</Text>
          </View>

          <ProfileSnapshotCard />
          <MatchesOverviewCard />
          <MessagingSnapshotCard />
          <EngagementInsightsCard />
          <DiscoverSection />
          <BoostsCard />
          <SafetyCard />
          <GamificationCard />

          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    safeArea: {
      flex: 1,
    },
    scrollContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      padding: 20,
      paddingBottom: 10,
    },
    welcomeText: {
      fontSize: 16,
      color: withAlpha(theme.textMuted, 0.9),
      marginBottom: 4,
    },
    headerTitle: {
      fontSize: 32,
      color: theme.text,
      fontFamily: 'PlayfairDisplay_700Bold',
    },
    card: {
      backgroundColor: theme.backgroundSubtle,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 20,
      padding: 20,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 5,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    profileHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    profilePhotoContainer: {
      position: "relative",
    },
    profilePhoto: {
      width: 60,
      height: 60,
      borderRadius: 30,
    },
    onlineRing: {
      position: "absolute",
      top: -3,
      left: -3,
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 3,
    },
    profileInfo: {
      marginLeft: 16,
      flex: 1,
    },
    profileName: {
      fontSize: 20,
      color: theme.text,
      fontFamily: 'PlayfairDisplay_600SemiBold',
    },
    lastActive: {
      fontSize: 14,
      color: theme.secondary,
      marginBottom: 4,
    },
    moodContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    moodSticker: {
      fontSize: 16,
      marginRight: 6,
    },
    moodText: {
      fontSize: 14,
      color: theme.textMuted,
    },
    completionBar: {
      marginTop: 12,
    },
    completionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    completionText: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
    },
    completionSuggestion: {
      fontSize: 12,
      color: theme.tint,
    },
    progressBar: {
      height: 8,
      backgroundColor: withAlpha(theme.text, isDark ? 0.25 : 0.08),
      borderRadius: 4,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: theme.secondary,
      borderRadius: 4,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 18,
      color: theme.text,
      fontFamily: 'PlayfairDisplay_600SemiBold',
    },
    badge: {
      backgroundColor: theme.tint,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {
      color: Colors.light.background,
      fontSize: 12,
      fontWeight: "bold",
    },
    matchesScroll: {
      marginHorizontal: -10,
    },
    matchItem: {
      alignItems: "center",
      marginHorizontal: 10,
      width: 80,
    },
    matchPhotoContainer: {
      position: "relative",
      marginBottom: 8,
    },
    matchPhoto: {
      fontSize: 40,
      textAlign: "center",
    },
    unreadBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      backgroundColor: theme.tint,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    unreadText: {
      color: Colors.light.background,
      fontSize: 10,
      fontWeight: "bold",
    },
    matchName: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 8,
    },
    matchActions: {
      flexDirection: "row",
      gap: 8,
    },
    actionBtn: {
      backgroundColor: theme.tint,
      borderRadius: 16,
      padding: 6,
    },
    conversationItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    conversationPhoto: {
      fontSize: 24,
      marginRight: 12,
    },
    conversationInfo: {
      flex: 1,
    },
    conversationHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    conversationName: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      marginRight: 8,
    },
    statusIndicator: {
      marginLeft: "auto",
    },
    statusIcon: {
      fontSize: 12,
    },
    lastMessage: {
      fontSize: 14,
      color: theme.textMuted,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.tint,
      marginLeft: 8,
    },
    moodStickersBar: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    moodStickersTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 8,
    },
    moodStickers: {
      flexDirection: "row",
      gap: 8,
    },
    moodStickerBtn: {
      backgroundColor: theme.backgroundSubtle,
      borderRadius: 20,
      padding: 8,
    },
    moodStickerText: {
      fontSize: 16,
      color: theme.text,
    },
    insightsGrid: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginBottom: 16,
    },
    insightItem: {
      alignItems: "center",
    },
    insightNumber: {
      fontSize: 24,
      fontWeight: "bold",
      color: theme.text,
      marginTop: 4,
    },
    insightLabel: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    streakHighlight: {
      backgroundColor: withAlpha(theme.accent, isDark ? 0.28 : 0.18),
      borderRadius: 12,
      padding: 12,
      alignItems: "center",
    },
    streakText: {
      fontSize: 14,
      color: theme.accent,
      fontWeight: "600",
    },
    discoverCategories: {
      marginBottom: 16,
    },
    discoverCategory: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.backgroundSubtle,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    categoryText: {
      marginLeft: 12,
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
    },
    swipeButton: {
      borderRadius: 16,
      overflow: "hidden",
    },
    swipeButtonGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      paddingHorizontal: 24,
      backgroundColor: theme.tint,
      borderRadius: 16,
    },
    swipeButtonText: {
      color: Colors.light.background,
      fontSize: 16,
      fontWeight: "bold",
      marginLeft: 8,
    },
    boostInfo: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    boostItem: {
      flexDirection: "row",
      alignItems: "center",
    },
    boostText: {
      marginLeft: 8,
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
    },
    superLikeBtn: {
      borderRadius: 12,
      overflow: "hidden",
    },
    superLikeGradient: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: theme.tint,
      borderRadius: 12,
    },
    superLikeText: {
      color: Colors.light.background,
      fontSize: 12,
      fontWeight: "bold",
      marginLeft: 4,
    },
    safetyTip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: withAlpha(theme.accent, isDark ? 0.26 : 0.18),
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    safetyText: {
      marginLeft: 8,
      fontSize: 14,
      color: theme.text,
      flex: 1,
    },
    safetyActions: {
      flexDirection: "row",
      gap: 12,
    },
    safetyBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.backgroundSubtle,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    safetyBtnText: {
      marginLeft: 6,
      fontSize: 12,
      fontWeight: "600",
      color: theme.text,
    },
    badgesContainer: {
      flexDirection: "row",
      justifyContent: "space-around",
    },
    badgeItem: {
      alignItems: "center",
      flex: 1,
    },
    badgeIcon: {
      fontSize: 24,
      marginBottom: 4,
    },
    badgeName: {
      fontSize: 10,
      fontWeight: "600",
      color: theme.text,
      textAlign: "center",
      marginBottom: 4,
    },
    bottomPadding: {
      height: 20,
    },
  });
