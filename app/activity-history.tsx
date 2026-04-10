import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { fetchPeerVisibilityPrefs } from "@/lib/peer-visibility";
import { getUserFacingDisplayName } from "@/lib/profile/display-name";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

type ActivityType =
  | "note"
  | "gift"
  | "like"
  | "superlike"
  | "match"
  | "profile_reaction"
  | "message"
  | "message_reaction";

type ActivityItem = {
  id: string;
  type: ActivityType;
  actorId: string;
  actorUserId?: string | null;
  actorName: string;
  actorAvatar?: string | null;
  body: string;
  createdAt: string;
  chatId?: string | null;
  profileId?: string | null;
};

type ActivityFilter = "all" | "notes" | "gifts" | "likes" | "matches" | "reactions" | "messages";

const giftLabel = (giftType?: string | null) => {
  switch (giftType) {
    case "rose":
      return "a rose";
    case "teddy":
      return "a teddy bear";
    case "ring":
      return "a ring";
    default:
      return "a gift";
  }
};

const timeAgo = (iso?: string | null) => {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const messagePreview = (row: any) => {
  if (!row) return "New message";
  if (row?.text) return row.text;
  switch (row?.message_type) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "voice":
      return "Voice message";
    case "location":
      return "Location";
    default:
      return "New message";
  }
};

export default function ActivityHistoryScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { user, profile } = useAuth();

  const profileId = profile?.id ?? null;
  const userId = user?.id ?? null;

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId || !userId) {
      setItems([]);
      return;
    }

    let cancelled = false;

    const fetchActivity = async () => {
      setLoading(true);
      try {
        const [
          notesRes,
          giftsRes,
          swipesRes,
          matchesRes,
          profileReactionsRes,
          messagesRes,
          messageReactionsRes,
        ] = await Promise.all([
          supabase
            .from("profile_notes")
            .select("id,sender_id,note,created_at")
            .eq("profile_id", profileId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("profile_gifts")
            .select("id,sender_id,gift_type,created_at")
            .eq("profile_id", profileId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("swipes")
            .select("id,swiper_id,action,created_at")
            .eq("target_id", profileId)
            .in("action", ["LIKE", "SUPERLIKE"])
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("matches")
            .select("id,user1_id,user2_id,status,created_at")
            .eq("status", "ACCEPTED")
            .or(`user1_id.eq.${profileId},user2_id.eq.${profileId}`)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("profile_image_reactions")
            .select("id,reactor_user_id,emoji,created_at")
            .eq("profile_id", profileId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("messages")
            .select("id,sender_id,receiver_id,text,message_type,created_at")
            .eq("receiver_id", profileId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("message_reactions")
            .select("id,message_id,user_id,emoji,created_at")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        if (cancelled) return;

        const notes = (notesRes.data || []) as any[];
        const gifts = (giftsRes.data || []) as any[];
        const swipes = (swipesRes.data || []) as any[];
        const matches = (matchesRes.data || []) as any[];
        const profileReactions = (profileReactionsRes.data || []) as any[];
        const messages = (messagesRes.data || []) as any[];
        const messageReactions = (messageReactionsRes.data || []) as any[];

        const messageIds = Array.from(
          new Set(messageReactions.map((row) => row?.message_id).filter(Boolean)),
        );

        const { data: reactionMessages } = messageIds.length
          ? await supabase
              .from("messages")
              .select("id,sender_id,receiver_id")
              .in("id", messageIds)
          : { data: [] };

        const messageById = new Map<string, any>();
        (reactionMessages || []).forEach((row: any) => {
          if (row?.id) messageById.set(row.id, row);
        });

        const actorIds = new Set<string>();
        notes.forEach((row) => row?.sender_id && actorIds.add(row.sender_id));
        gifts.forEach((row) => row?.sender_id && actorIds.add(row.sender_id));
        swipes.forEach((row) => row?.swiper_id && actorIds.add(row.swiper_id));
        profileReactions.forEach((row) => row?.reactor_user_id && actorIds.add(row.reactor_user_id));
        messages.forEach((row) => row?.sender_id && actorIds.add(row.sender_id));
        messageReactions.forEach((row) => row?.user_id && actorIds.add(row.user_id));
        matches.forEach((row) => {
          if (row?.user1_id && row.user1_id !== profileId) actorIds.add(row.user1_id);
          if (row?.user2_id && row.user2_id !== profileId) actorIds.add(row.user2_id);
        });

        const profileById = new Map<string, any>();
        let hiddenPeerUserIds = new Set<string>();
        if (actorIds.size) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id,user_id,full_name,avatar_url,account_state,deleted_at")
            .in("id", Array.from(actorIds));
          (profilesData || []).forEach((p: any) => {
            if (p?.id) profileById.set(p.id, p);
          });
          const peerUserIds = Array.from(
            new Set(
              ((profilesData as any[]) || [])
                .map((p) => (typeof p?.user_id === "string" ? p.user_id : null))
                .filter((value): value is string => Boolean(value)),
            ),
          );
          const hiddenPrefs = await fetchPeerVisibilityPrefs(userId, peerUserIds);
          hiddenPeerUserIds = new Set(
            Object.entries(hiddenPrefs)
              .filter(([, pref]) => pref.hidden)
              .map(([peerUserId]) => peerUserId),
          );
        }

        const activityItems: ActivityItem[] = [];

        notes.forEach((row) => {
          const profileRow = profileById.get(row.sender_id);
          if (profileRow?.user_id && hiddenPeerUserIds.has(profileRow.user_id)) return;
            activityItems.push({
              id: `note-${row.id}`,
              type: "note",
              actorId: row.sender_id,
              actorUserId: profileRow?.user_id ?? null,
              actorName: getUserFacingDisplayName(profileRow, "New note"),
              actorAvatar: profileRow?.avatar_url ?? null,
            body: row.note || "Sent you a note",
            createdAt: row.created_at,
            profileId: row.sender_id,
          });
        });

          gifts.forEach((row) => {
            const profileRow = profileById.get(row.sender_id);
            if (profileRow?.user_id && hiddenPeerUserIds.has(profileRow.user_id)) return;
            const senderName = getUserFacingDisplayName(profileRow, "New gift");
            activityItems.push({
            id: `gift-${row.id}`,
            type: "gift",
            actorId: row.sender_id,
            actorUserId: profileRow?.user_id ?? null,
            actorName: senderName,
            actorAvatar: profileRow?.avatar_url ?? null,
            body: `Sent you ${giftLabel(row.gift_type)}`,
            createdAt: row.created_at,
            profileId: row.sender_id,
          });
        });

        swipes.forEach((row) => {
          const profileRow = profileById.get(row.swiper_id);
          if (profileRow?.user_id && hiddenPeerUserIds.has(profileRow.user_id)) return;
          const action = row.action === "SUPERLIKE" ? "superlike" : "like";
            activityItems.push({
              id: `swipe-${row.id}`,
              type: action === "superlike" ? "superlike" : "like",
              actorId: row.swiper_id,
              actorUserId: profileRow?.user_id ?? null,
              actorName: getUserFacingDisplayName(profileRow, "Someone"),
              actorAvatar: profileRow?.avatar_url ?? null,
            body: action === "superlike" ? "Superliked your profile" : "Liked your profile",
            createdAt: row.created_at,
            profileId: row.swiper_id,
          });
        });

        matches.forEach((row) => {
          if (row?.status !== "ACCEPTED") return;
          const otherId = row.user1_id === profileId ? row.user2_id : row.user1_id;
          if (!otherId) return;
          const profileRow = profileById.get(otherId);
          if (profileRow?.user_id && hiddenPeerUserIds.has(profileRow.user_id)) return;
            activityItems.push({
              id: `match-${row.id}`,
              type: "match",
              actorId: otherId,
              actorUserId: profileRow?.user_id ?? null,
              actorName: getUserFacingDisplayName(profileRow, "New match"),
              actorAvatar: profileRow?.avatar_url ?? null,
            body: "It's a match",
            createdAt: row.created_at,
            profileId: otherId,
          });
        });

        profileReactions.forEach((row) => {
          const profileRow = profileById.get(row.reactor_user_id);
          if (profileRow?.user_id && hiddenPeerUserIds.has(profileRow.user_id)) return;
          const emoji = row.emoji ? ` ${row.emoji}` : "";
            activityItems.push({
              id: `profile-react-${row.id}`,
              type: "profile_reaction",
              actorId: row.reactor_user_id,
              actorUserId: profileRow?.user_id ?? null,
              actorName: getUserFacingDisplayName(profileRow, "Someone"),
              actorAvatar: profileRow?.avatar_url ?? null,
            body: `Reacted to your photo${emoji}`,
            createdAt: row.created_at,
            profileId: row.reactor_user_id,
          });
        });

        messages.forEach((row) => {
          const profileRow = profileById.get(row.sender_id);
          if (profileRow?.user_id && hiddenPeerUserIds.has(profileRow.user_id)) return;
            activityItems.push({
              id: `message-${row.id}`,
              type: "message",
              actorId: row.sender_id,
              actorUserId: profileRow?.user_id ?? null,
              actorName: getUserFacingDisplayName(profileRow, "New message"),
              actorAvatar: profileRow?.avatar_url ?? null,
            body: messagePreview(row),
            createdAt: row.created_at,
            chatId: row.sender_id,
          });
        });

        messageReactions.forEach((row) => {
          const msg = messageById.get(row.message_id);
          if (!msg) return;
          if (msg.sender_id !== profileId && msg.receiver_id !== profileId) return;
          const otherId = msg.sender_id === profileId ? msg.receiver_id : msg.sender_id;
          const profileRow = profileById.get(row.user_id);
          if (profileRow?.user_id && hiddenPeerUserIds.has(profileRow.user_id)) return;
          const emoji = row.emoji ? ` ${row.emoji}` : "";
            activityItems.push({
              id: `message-react-${row.id}`,
              type: "message_reaction",
              actorId: row.user_id,
              actorUserId: profileRow?.user_id ?? null,
              actorName: getUserFacingDisplayName(profileRow, "Someone"),
              actorAvatar: profileRow?.avatar_url ?? null,
            body: `Reacted to your message${emoji}`,
            createdAt: row.created_at,
            chatId: otherId,
          });
        });

        activityItems.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
        setItems(activityItems);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchActivity();

    const channel = supabase
      .channel(`activity:${profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profile_notes", filter: `profile_id=eq.${profileId}` },
        () => void fetchActivity(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profile_gifts", filter: `profile_id=eq.${profileId}` },
        () => void fetchActivity(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swipes", filter: `target_id=eq.${profileId}` },
        () => void fetchActivity(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => void fetchActivity(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${profileId}` },
        () => void fetchActivity(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_image_reactions", filter: `profile_id=eq.${profileId}` },
        () => void fetchActivity(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => void fetchActivity(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profileId, userId]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => {
      switch (filter) {
        case "notes":
          return item.type === "note";
        case "gifts":
          return item.type === "gift";
        case "likes":
          return item.type === "like" || item.type === "superlike";
        case "matches":
          return item.type === "match";
        case "reactions":
          return item.type === "profile_reaction" || item.type === "message_reaction";
        case "messages":
          return item.type === "message";
        default:
          return true;
      }
    });
  }, [filter, items]);

  const openActivityTarget = (item: ActivityItem) => {
    if (item.chatId) {
      router.push({
        pathname: "/chat/[id]",
        params: { id: item.chatId, userName: item.actorName, userAvatar: item.actorAvatar ?? "" },
      });
      return;
    }
    if (item.profileId) {
      router.push({ pathname: "/profile-view", params: { profileId: String(item.profileId) } });
    }
  };

  const filters: { key: ActivityFilter; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "view-grid-outline" },
    { key: "notes", label: "Notes", icon: "message-text-outline" },
    { key: "gifts", label: "Gifts", icon: "gift-outline" },
    { key: "likes", label: "Likes", icon: "heart-outline" },
    { key: "matches", label: "Matches", icon: "cards-heart-outline" },
    { key: "reactions", label: "Reactions", icon: "emoticon-outline" },
    { key: "messages", label: "Messages", icon: "message-outline" },
  ];

  const emptyState = useMemo(() => {
    switch (filter) {
      case "notes":
        return {
          badge: "Notes inbox",
          title: "No notes have landed yet",
          body: "Profiles that feel complete, specific, and warm usually attract the strongest written openings.",
          highlights: [
            { icon: "text-box-check-outline", text: "A clear bio and good prompts make it easier for someone to write first." },
            { icon: "account-heart-outline", text: "Refreshing your photos and interests can invite better conversation starters." },
          ],
        };
      case "gifts":
        return {
          badge: "Gift history",
          title: "No gifts in your timeline yet",
          body: "Gifts usually follow momentum. Keep your profile vivid enough that someone wants to leave a memorable signal.",
          highlights: [
            { icon: "gift-outline", text: "Moments and expressive prompts give admirers more reasons to act." },
            { icon: "star-four-points-outline", text: "Premium profiles create stronger intent and stronger follow-through." },
          ],
        };
      case "likes":
        return {
          badge: "Interest signals",
          title: "No likes or superlikes yet",
          body: "This part of your history fills fastest when your first photo, headline, and profile energy are doing real work.",
          highlights: [
            { icon: "heart-outline", text: "Lead with a photo that feels confident, recent, and unmistakably you." },
            { icon: "refresh", text: "A fresh profile edit can reset attention and improve incoming interest." },
          ],
        };
      case "matches":
        return {
          badge: "Match timeline",
          title: "No matches have been recorded yet",
          body: "A strong match loop starts with better discovery, not just more swipes. Precision usually beats volume.",
          highlights: [
            { icon: "cards-heart-outline", text: "Spend more time on profiles that already show alignment and effort." },
            { icon: "message-outline", text: "When a match comes in, the first reply matters more than the first like." },
          ],
        };
      case "reactions":
        return {
          badge: "Reactions",
          title: "No reactions have shown up yet",
          body: "Photo and message reactions rise when your profile carries more texture and your chats feel easy to respond to.",
          highlights: [
            { icon: "emoticon-outline", text: "Moments, captions, and playful details create better reasons to react." },
            { icon: "image-outline", text: "A richer gallery gives people something specific to notice." },
          ],
        };
      case "messages":
        return {
          badge: "Message flow",
          title: "No incoming messages in history yet",
          body: "Conversation starts when discovery and trust work together. This timeline will feel fuller as those pieces tighten.",
          highlights: [
            { icon: "message-outline", text: "A premium profile lowers hesitation and makes the first message easier." },
            { icon: "shield-check-outline", text: "Trust signals like verification and profile completion reduce friction." },
          ],
        };
      default:
        return {
          badge: "Quiet timeline",
          title: "Your activity history is still quiet",
          body: "This timeline becomes more useful as your profile, Moments, and conversations build momentum together.",
          highlights: [
            { icon: "account-star-outline", text: "Polished profiles usually create better likes, messages, and introductions." },
            { icon: "calendar-heart", text: "Consistent activity keeps you visible and gives people more to respond to." },
          ],
        };
    }
  }, [filter]);

  const renderEmptyTimeline = () => (
    <View style={styles.emptyCard}>
      <View style={styles.emptyBadge}>
        <Text style={styles.emptyBadgeText}>{emptyState.badge}</Text>
      </View>
      <Text style={styles.emptyTitle}>{emptyState.title}</Text>
      <Text style={styles.emptyText}>{emptyState.body}</Text>
      <View style={styles.emptyHighlights}>
        {emptyState.highlights.map((item) => (
          <View key={item.text} style={styles.emptyHighlightRow}>
            <MaterialCommunityIcons name={item.icon as any} size={16} color={theme.tint} />
            <Text style={styles.emptyHighlightText}>{item.text}</Text>
          </View>
        ))}
      </View>
      <View style={styles.emptyActions}>
        <Pressable style={styles.emptyPrimary} onPress={() => router.push("/(tabs)/vibes")}>
          <Text style={styles.emptyPrimaryText}>Open Vibes</Text>
        </Pressable>
        <Pressable style={styles.emptySecondary} onPress={() => router.push("/moments")}>
          <Text style={styles.emptySecondaryText}>View Moments</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.tint, isDark ? 0.28 : 0.16), withAlpha(theme.background, 0.0)]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.bgGlow}
      />
      <LinearGradient
        colors={[withAlpha(theme.accent, isDark ? 0.2 : 0.14), "transparent"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.bgGlowRight}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={theme.text} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>History</Text>
          <Text style={styles.headerSubtitle}>Your full activity timeline.</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.filterRow}>
            {filters.map((pill) => {
              const active = pill.key === filter;
              return (
                <Pressable
                  key={pill.key}
                  onPress={() => setFilter(pill.key)}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <MaterialCommunityIcons
                    name={pill.icon as any}
                    size={16}
                    color={active ? Colors.light.background : theme.textMuted}
                  />
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{pill.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timelineCard}>
            <LinearGradient
              colors={[withAlpha(theme.tint, isDark ? 0.35 : 0.18), "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.timelineGlow}
            />
            {loading ? (
              <Text style={styles.emptyText}>Loading history...</Text>
            ) : filteredItems.length === 0 ? (
              renderEmptyTimeline()
            ) : (
              filteredItems.map((item) => (
                <Pressable key={item.id} style={styles.activityRow} onPress={() => openActivityTarget(item)}>
                  <View style={styles.avatarShell}>
                    {item.actorAvatar ? (
                      <LinearGradient
                        colors={[withAlpha(theme.tint, 0.9), withAlpha(theme.accent, 0.7)]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.avatarRing}
                      >
                        <View style={styles.avatarImageWrap}>
                          <Image source={{ uri: item.actorAvatar }} style={styles.avatarImage} />
                        </View>
                      </LinearGradient>
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarFallbackText}>{item.actorName?.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.activityInfo}>
                    <View style={styles.activityTopRow}>
                      <Text style={styles.activityTitle}>{item.actorName}</Text>
                      <Text style={styles.activityTime}>{timeAgo(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.activityBody} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>
                  <View style={styles.activityBadge}>
                    <MaterialCommunityIcons name={iconForType(item.type) as any} size={18} color={theme.tint} />
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const iconForType = (type: ActivityType) => {
  switch (type) {
    case "note":
      return "message-text-outline";
    case "gift":
      return "gift-outline";
    case "like":
      return "heart-outline";
    case "superlike":
      return "star-outline";
    case "match":
      return "cards-heart-outline";
    case "profile_reaction":
      return "emoticon-outline";
    case "message":
      return "message-outline";
    case "message_reaction":
      return "message-reply-outline";
    default:
      return "bell-outline";
  }
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    safeArea: {
      flex: 1,
    },
    bgGlow: {
      position: "absolute",
      top: -60,
      left: -80,
      width: width * 0.9,
      height: width * 0.9,
      borderRadius: width,
    },
    bgGlowRight: {
      position: "absolute",
      top: 160,
      right: -120,
      width: width * 0.7,
      height: width * 0.7,
      borderRadius: width,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 10,
    },
    backButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    backLabel: {
      fontSize: 12,
      color: theme.text,
      fontWeight: "600",
    },
    headerTitle: {
      marginTop: 12,
      fontSize: 30,
      color: theme.text,
      fontFamily: "PlayfairDisplay_700Bold",
      letterSpacing: 0.4,
    },
    headerSubtitle: {
      marginTop: 6,
      color: theme.textMuted,
      fontSize: 13,
    },
    scrollContent: {
      paddingHorizontal: 18,
      paddingBottom: 30,
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 12,
      marginBottom: 18,
    },
    filterPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.1),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.3 : 0.6),
    },
    filterPillActive: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
    },
    filterText: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: "600",
    },
    filterTextActive: {
      color: Colors.light.background,
    },
    timelineCard: {
      position: "relative",
      borderRadius: 22,
      padding: 18,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.32 : 0.7),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      overflow: "hidden",
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.22 : 0.12,
      shadowRadius: 18,
      elevation: 6,
    },
    timelineGlow: {
      position: "absolute",
      top: -20,
      left: -30,
      width: 180,
      height: 180,
      borderRadius: 180,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },
    emptyCard: {
      borderRadius: 18,
      padding: 16,
      gap: 10,
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.82),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    emptyBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.46 : 0.9),
    },
    emptyBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.3,
      color: theme.textMuted,
    },
    emptyTitle: {
      fontSize: 19,
      lineHeight: 24,
      color: theme.text,
      fontFamily: "PlayfairDisplay_700Bold",
    },
    emptyHighlights: {
      gap: 8,
    },
    emptyHighlightRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    emptyHighlightText: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    emptyActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 2,
    },
    emptyPrimary: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    emptyPrimaryText: {
      color: Colors.light.background,
      fontSize: 12,
      fontWeight: "700",
    },
    emptySecondary: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.3 : 0.7),
    },
    emptySecondaryText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "600",
    },
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    avatarShell: {
      marginRight: 12,
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarRing: {
      width: 46,
      height: 46,
      borderRadius: 23,
      padding: 2,
    },
    avatarImageWrap: {
      flex: 1,
      borderRadius: 21,
      overflow: "hidden",
      backgroundColor: withAlpha(theme.background, 0.8),
    },
    avatarImage: {
      flex: 1,
      borderRadius: 21,
    },
    avatarFallback: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    avatarFallbackText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "700",
    },
    activityInfo: {
      flex: 1,
    },
    activityTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    activityTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.text,
    },
    activityTime: {
      fontSize: 11,
      color: theme.textMuted,
    },
    activityBody: {
      marginTop: 4,
      fontSize: 13,
      color: theme.textMuted,
    },
    activityBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.2 : 0.12),
      marginLeft: 10,
    },
  });
