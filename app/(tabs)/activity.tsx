import { Colors } from "@/constants/theme";
import InboxItemCard from "@/components/InboxItemCard";
import MatchModal from "@/components/MatchModal";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useInbox, type InboxItem } from "@/hooks/useInbox";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Match } from "@/types/match";

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

const getInitials = (name: string) => {
  const cleaned = (name || "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + second).toUpperCase() || cleaned.slice(0, 1).toUpperCase();
};

type InboxFilter = "all" | "needs_action" | "likes" | "messages" | "moments" | "system";

type ActorProfile = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  age?: number | null;
  bio?: string | null;
};

export default function ActivityScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { user } = useAuth();

  const { items, loading, markRead, markAllRead, resolveItem } = useInbox(user?.id ?? null);
  const [filter, setFilter] = useState<InboxFilter>("needs_action");
  const [actorMap, setActorMap] = useState<Record<string, ActorProfile>>({});
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [matchCandidate, setMatchCandidate] = useState<Match | null>(null);

  const actorIds = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => (typeof item.actor_id === "string" ? item.actor_id : null))
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    [items],
  );

  useEffect(() => {
    if (actorIds.length === 0) {
      setActorMap({});
      return;
    }

    let cancelled = false;

    const fetchActors = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url,age,bio")
        .in("id", actorIds);

      if (cancelled) return;

      const map: Record<string, ActorProfile> = {};
      (data || []).forEach((row: any) => {
        if (!row?.id) return;
        map[row.id] = row;
      });

      setActorMap(map);
    };

    void fetchActors();

    return () => {
      cancelled = true;
    };
  }, [actorIds]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => {
      switch (filter) {
        case "needs_action":
          return item.action_required;
        case "likes":
          return item.type === "LIKE_RECEIVED" || item.type === "SUPERLIKE_RECEIVED";
        case "messages":
          return item.type === "NEW_MESSAGE" || item.type === "MESSAGE_REQUEST";
        case "moments":
          return item.type === "MOMENT_REACTION" || item.type === "MOMENT_COMMENT";
        case "system":
          return item.type === "SYSTEM";
        default:
          return true;
      }
    });
  }, [filter, items]);

  const openProfile = useCallback((profileId?: string | null) => {
    if (!profileId) return;
    router.push({ pathname: "/profile-view", params: { profileId: String(profileId) } });
  }, []);

  const openChat = useCallback((actorId?: string | null, actorName?: string, actorAvatar?: string | null) => {
    if (!actorId) return;
    router.push({
      pathname: "/chat/[id]",
      params: { id: actorId, userName: actorName ?? "", userAvatar: actorAvatar ?? "" },
    });
  }, []);

  const openMoments = useCallback((actorId?: string | null, momentId?: string | null) => {
    if (!actorId) return;
    router.push({ pathname: "/moments", params: { startUserId: String(actorId), startMomentId: momentId ?? "" } });
  }, []);

  const handleMarkRead = useCallback(
    (item: InboxItem) => {
      if (!item.read_at) void markRead(item.id);
    },
    [markRead],
  );

  const resolveAndRead = useCallback(
    (item: InboxItem) => {
      void resolveItem(item.id);
    },
    [resolveItem],
  );

  const checkMutual = useCallback(
    async (actorId: string) => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("swipes")
        .select("id")
        .eq("swiper_id", actorId)
        .eq("target_id", user.id)
        .in("action", ["LIKE", "SUPERLIKE"])
        .limit(1);

      if (data && data.length > 0) {
        const actor = actorMap[actorId];
        setMatchCandidate(makeMatchFromProfile(actorId, actor));
        setMatchModalVisible(true);
        return;
      }

      const { data: matches } = await supabase
        .from("matches")
        .select("id")
        .or(
          `and(user1_id.eq.${user.id},user2_id.eq.${actorId},status.eq.ACCEPTED),and(user1_id.eq.${actorId},user2_id.eq.${user.id},status.eq.ACCEPTED)`,
        )
        .limit(1);

      if (matches && matches.length > 0) {
        const actor = actorMap[actorId];
        setMatchCandidate(makeMatchFromProfile(actorId, actor));
        setMatchModalVisible(true);
      }
    },
    [actorMap, user?.id],
  );

  const sendSwipe = useCallback(
    async (actorId: string, action: "LIKE" | "PASS" | "SUPERLIKE") => {
      if (!user?.id) return;
      await supabase
        .from("swipes")
        .upsert([{ swiper_id: user.id, target_id: actorId, action }], { onConflict: "swiper_id,target_id" });
      if (action === "LIKE" || action === "SUPERLIKE") {
        await checkMutual(actorId);
      }
    },
    [checkMutual, user?.id],
  );

  const sendThanks = useCallback(
    async (actorId: string) => {
      if (!user?.id) return;
      await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: actorId,
        text: "Thanks for the gift!",
        message_type: "text",
      });
    },
    [user?.id],
  );

  const renderItem = useCallback(
    ({ item }: { item: InboxItem }) => {
      const actorId = typeof item.actor_id === "string" ? item.actor_id : null;
      const actor = actorId ? actorMap[actorId] : undefined;
      const actorName =
        (actor?.full_name || (item.metadata as any)?.name || "").trim() ||
        (item.type === "SYSTEM" ? "Betweener" : "Someone");
      const actorAvatar = actor?.avatar_url ?? (item.metadata as any)?.avatar_url ?? null;
      const initials = getInitials(actorName);
      const isUnread = !item.read_at;
      const isActionRequired = item.action_required;
      const timeLabel = timeAgo(item.created_at);

      const handleOpen = () => {
        handleMarkRead(item);
        if (item.type === "SYSTEM") {
          router.push("/(tabs)/profile");
          return;
        }
        if (item.type === "NEW_MESSAGE" || item.type === "MESSAGE_REQUEST") {
          openChat(actorId, actorName, actorAvatar);
          return;
        }
        if (item.type === "MOMENT_REACTION" || item.type === "MOMENT_COMMENT") {
          openMoments(actorId, item.entity_id ?? null);
          return;
        }
        if (actorId) {
          openProfile(actorId);
        }
      };

      const primaryAction = (() => {
        switch (item.type) {
          case "LIKE_RECEIVED":
          case "SUPERLIKE_RECEIVED":
            return actorId
              ? {
                  label: "Like back",
                  onPress: async () => {
                    await sendSwipe(actorId, "LIKE");
                    resolveAndRead(item);
                  },
                }
              : undefined;
          case "NEW_MESSAGE":
          case "MESSAGE_REQUEST":
            return {
              label: "Reply",
              onPress: () => {
                handleMarkRead(item);
                openChat(actorId, actorName, actorAvatar);
              },
            };
          case "MOMENT_REACTION":
            return {
              label: "View Moment",
              onPress: () => {
                handleMarkRead(item);
                openMoments(actorId, item.entity_id ?? null);
              },
            };
          case "MOMENT_COMMENT":
            return {
              label: "Reply",
              onPress: () => {
                handleMarkRead(item);
                openMoments(actorId, item.entity_id ?? null);
              },
            };
          case "GIFT_RECEIVED":
            return actorId
              ? {
                  label: "Say Thanks",
                  onPress: async () => {
                    await sendThanks(actorId);
                    resolveAndRead(item);
                  },
                }
              : undefined;
          case "MATCH_CREATED":
            return {
              label: "Send Message",
              onPress: () => {
                handleMarkRead(item);
                openChat(actorId, actorName, actorAvatar);
              },
            };
          case "SYSTEM":
            return {
              label: "Verify Now",
              onPress: () => {
                handleMarkRead(item);
                router.push("/(tabs)/profile");
              },
            };
          default:
            return undefined;
        }
      })();

      const secondaryAction = (() => {
        switch (item.type) {
          case "LIKE_RECEIVED":
            return actorId
              ? {
                  label: "Pass",
                  onPress: async () => {
                    await sendSwipe(actorId, "PASS");
                    resolveAndRead(item);
                  },
                }
              : undefined;
          case "SUPERLIKE_RECEIVED":
            return {
              label: "View",
              onPress: () => {
                handleMarkRead(item);
                openProfile(actorId);
              },
            };
          case "MOMENT_COMMENT":
            return {
              label: "View",
              onPress: () => {
                handleMarkRead(item);
                openMoments(actorId, item.entity_id ?? null);
              },
            };
          case "GIFT_RECEIVED":
            return {
              label: "View Profile",
              onPress: () => {
                handleMarkRead(item);
                openProfile(actorId);
              },
            };
          case "MATCH_CREATED":
            return {
              label: "Keep Discovering",
              onPress: () => {
                handleMarkRead(item);
                router.push("/(tabs)/explore");
              },
            };
          default:
            return undefined;
        }
      })();

      const badgeIcon = (() => {
        switch (item.type) {
          case "LIKE_RECEIVED":
            return "heart-outline";
          case "SUPERLIKE_RECEIVED":
            return "star";
          case "NEW_MESSAGE":
          case "MESSAGE_REQUEST":
            return "message-outline";
          case "MOMENT_REACTION":
          case "MOMENT_COMMENT":
            return "emoticon-outline";
          case "GIFT_RECEIVED":
            return "gift-outline";
          case "MATCH_CREATED":
            return "cards-heart-outline";
          default:
            return undefined;
        }
      })();

      return (
        <InboxItemCard
          title={item.title || actorName}
          body={item.body}
          timeLabel={timeLabel}
          avatarUrl={actorAvatar}
          initials={initials}
          isUnread={isUnread}
          isActionRequired={isActionRequired}
          badgeIcon={badgeIcon}
          systemIcon={item.type === "SYSTEM" ? "shield-check-outline" : undefined}
          primaryAction={primaryAction}
          secondaryAction={secondaryAction}
          onPress={handleOpen}
        />
      );
    },
    [actorMap, handleMarkRead, openChat, openMoments, openProfile, resolveAndRead, sendSwipe, sendThanks],
  );

  const filters: { key: InboxFilter; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "view-grid-outline" },
    { key: "needs_action", label: "Needs Action", icon: "alert-circle-outline" },
    { key: "likes", label: "Likes", icon: "heart-outline" },
    { key: "messages", label: "Messages", icon: "message-outline" },
    { key: "moments", label: "Moments", icon: "image-multiple-outline" },
    { key: "system", label: "System", icon: "shield-check-outline" },
  ];

  const emptyCopy = useMemo(() => {
    if (filter === "needs_action") return "No requests right now.";
    if (filter === "all") return "Your inbox is calm. Check Discover to meet people.";
    return "Nothing to show yet.";
  }, [filter]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.tint, isDark ? 0.28 : 0.18), "transparent"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.bgGlow}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Inbox</Text>
            <Text style={styles.headerSubtitle}>Stay on top of your connections.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerButton} onPress={() => void markAllRead()}>
              <MaterialCommunityIcons name="check-all" size={16} color={theme.text} />
              <Text style={styles.headerButtonText}>Mark read</Text>
            </Pressable>
            <Pressable style={styles.headerGhost} onPress={() => router.push("/activity-history")}>
              <Text style={styles.headerGhostText}>See history</Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.filterWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
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
                        size={14}
                        color={active ? Colors.light.background : theme.textMuted}
                      />
                      <Text style={[styles.filterText, active && styles.filterTextActive]}>{pill.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          }
          stickyHeaderIndices={[0]}
          ListEmptyComponent={
            loading ? (
              <Text style={styles.emptyText}>Loading inbox...</Text>
            ) : (
              <Text style={styles.emptyText}>{emptyCopy}</Text>
            )
          }
        />
      </SafeAreaView>
      <MatchModal
        visible={matchModalVisible}
        match={matchCandidate}
        onSendMessage={(m) => openChat(m?.id, m?.name, m?.avatar_url ?? null)}
        onKeepDiscovering={() => router.push("/(tabs)/explore")}
        onClose={() => {
          setMatchModalVisible(false);
          setMatchCandidate(null);
        }}
      />
    </View>
  );
}

const makeMatchFromProfile = (id: string, actor?: ActorProfile | null): Match => ({
  id,
  name: (actor?.full_name || "New match").trim() || "New match",
  age: Number(actor?.age) || 0,
  tagline: actor?.bio || "",
  interests: [],
  avatar_url: actor?.avatar_url ?? undefined,
});

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
      top: -120,
      right: -120,
      width: 320,
      height: 320,
      borderRadius: 320,
    },
    header: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 6,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    headerTitle: {
      fontSize: 30,
      color: theme.text,
      fontFamily: "PlayfairDisplay_700Bold",
    },
    headerSubtitle: {
      marginTop: 6,
      fontSize: 12,
      color: theme.textMuted,
    },
    headerActions: {
      alignItems: "flex-end",
      gap: 8,
    },
    headerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
    },
    headerButtonText: {
      fontSize: 11,
      color: theme.text,
      fontWeight: "600",
    },
    headerGhost: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    headerGhostText: {
      fontSize: 12,
      color: theme.tint,
      fontWeight: "600",
    },
    listContent: {
      paddingHorizontal: 18,
      paddingBottom: 30,
      paddingTop: 4,
    },
    filterWrap: {
      paddingTop: 12,
      paddingBottom: 10,
      backgroundColor: theme.background,
    },
    filterRow: {
      alignItems: "center",
      gap: 10,
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
    emptyText: {
      marginTop: 20,
      fontSize: 13,
      color: theme.textMuted,
    },
  });
