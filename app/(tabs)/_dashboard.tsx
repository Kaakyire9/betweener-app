import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const getGreeting = (date: Date) => {
  const h = date.getHours();
  if (h < 12) return "Good morning! ??";
  if (h < 18) return "Good afternoon! ???";
  return "Good evening! ??";
};

const getInitials = (name: string) => {
  const cleaned = (name || '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase() || cleaned.slice(0, 1).toUpperCase();
};

const computeProfileCompletion = (profile: any | null) => {
  if (!profile) return 0;
  const photos = Array.isArray(profile.photos) ? profile.photos.filter(Boolean) : [];

  const checks: boolean[] = [
    !!(profile.full_name || "").trim(),
    Number.isFinite(profile.age) && Number(profile.age) > 0,
    !!(profile.gender || "").trim(),
    !!(profile.region || "").trim(),
    !!(profile.bio || "").trim(),
    !!(profile.looking_for || "").trim(),
    !!(profile.occupation || "").trim(),
    !!(profile.education || "").trim(),
    !!(profile.height || "").trim(),
    photos.length > 0 || !!profile.avatar_url,
    !!(profile.exercise_frequency || "").trim(),
    !!(profile.smoking || "").trim(),
    !!(profile.drinking || "").trim(),
    !!(profile.has_children || "").trim(),
    !!(profile.wants_children || "").trim(),
    !!(profile.personality_type || "").trim(),
    !!(profile.love_language || "").trim(),
    Array.isArray(profile.languages_spoken) && profile.languages_spoken.length > 0,
    !!(profile.current_country || "").trim(),
  ];

  const filled = checks.filter(Boolean).length;
  const pct = Math.round((filled / checks.length) * 100);
  return Math.max(0, Math.min(100, pct));
};

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { user, profile } = useAuth();
  const [greeting, setGreeting] = useState(() => getGreeting(new Date()));
  const [liveProfile, setLiveProfile] = useState<any | null>(profile ?? null);

  useEffect(() => {
    setLiveProfile(profile ?? null);
  }, [profile]);

  useEffect(() => {
    // Keep greeting current while the screen is open.
    const t = setInterval(() => setGreeting(getGreeting(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    // Grab freshest profile, then keep it in sync via realtime.
    const fetchLatest = async () => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single();
        if (data) setLiveProfile(data);
      } catch {
        // ignore
      }
    };
    void fetchLatest();

    const channel = supabase
      .channel(`profiles:dashboard:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (payload?.new) setLiveProfile(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const profileCompletion = useMemo(() => computeProfileCompletion(liveProfile), [liveProfile]);

  const myProfileId = typeof liveProfile?.id === 'string' ? liveProfile.id : null;

  const [likesSuperlikesToday, setLikesSuperlikesToday] = useState(0);

  const displayName =
    (liveProfile?.full_name || '').trim() ||
    (user?.email ? user.email.split('@')[0] : '') ||
    'There';

  const avatarSource = useMemo(() => {
    const url = typeof liveProfile?.avatar_url === 'string' ? liveProfile.avatar_url.trim() : '';
    return url ? { uri: url } : require("@/assets/images/circle-logo.png");
  }, [liveProfile?.avatar_url]);

  const profilePhotosCount = useMemo(() => {
    const photos = Array.isArray(liveProfile?.photos) ? liveProfile.photos.filter(Boolean) : [];
    return photos.length;
  }, [liveProfile?.photos]);

  const completionSuggestion = useMemo(() => {
    if (!liveProfile) return "Complete your profile to get seen";
    if (profilePhotosCount < 3) return "Add 1 more photo for +20% visibility";
    const bio = (liveProfile.bio || '').trim();
    if (bio.length < 40) return "Add a longer bio for better matches";
    return "Looking good - keep it updated";
  }, [liveProfile, profilePhotosCount]);

  useEffect(() => {
    if (!myProfileId) return;

    const startOfToday = () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    };

    const fetchLikesSuperlikesToday = async () => {
      try {
        const { count } = await supabase
          .from('swipes')
          .select('id', { count: 'exact', head: true })
          .eq('target_id', myProfileId)
          .in('action', ['LIKE', 'SUPERLIKE'])
          .gte('created_at', startOfToday());

        setLikesSuperlikesToday(typeof count === 'number' ? count : 0);
      } catch {
        // ignore
      }
    };

    void fetchLikesSuperlikesToday();

    const channel = supabase
      .channel(`swipes:likes:${myProfileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swipes', filter: `target_id=eq.${myProfileId}` },
        (payload: any) => {
          const nextAction = payload?.new?.action;
          const oldAction = payload?.old?.action;
          const relevant =
            nextAction === 'LIKE' ||
            nextAction === 'SUPERLIKE' ||
            oldAction === 'LIKE' ||
            oldAction === 'SUPERLIKE';
          if (!relevant) return;
          void fetchLikesSuperlikesToday();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myProfileId]);

  const [matchesTodayCount, setMatchesTodayCount] = useState(0);
  const [profileViews, setProfileViews] = useState(0);
  const [likesReceived, setLikesReceived] = useState(0);
  const [conversationStreak, setConversationStreak] = useState(0);
  const [boostsLeft] = useState(2);
  const isOnline = !!liveProfile?.is_active;

  useEffect(() => {
    if (!user?.id || !myProfileId) {
      setProfileViews(0);
      setLikesReceived(0);
      setConversationStreak(0);
      return;
    }

    let cancelled = false;

    const toLocalYmd = (d: Date) => {
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const startOfLocalDayIso = (daysAgo: number) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };

    const refreshWeekInNumbers = async () => {
      const weekStartIso = startOfLocalDayIso(6);

      try {
        const { count, error } = await supabase
          .from('swipes')
          .select('id', { count: 'exact', head: true })
          .eq('target_id', myProfileId)
          .in('action', ['LIKE', 'SUPERLIKE'])
          .gte('created_at', weekStartIso);

        if (!cancelled) setLikesReceived(!error && typeof count === 'number' ? count : 0);
      } catch {
        if (!cancelled) setLikesReceived(0);
      }

      try {
        const { data: msgs, error } = await supabase
          .from('messages')
          .select('created_at')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .gte('created_at', startOfLocalDayIso(60))
          .order('created_at', { ascending: false })
          .limit(2000);

        if (!cancelled) {
          if (error || !msgs) {
            setConversationStreak(0);
          } else {
            const daySet = new Set<string>();
            for (const row of msgs as any[]) {
              const createdAt = row?.created_at;
              if (typeof createdAt !== 'string') continue;
              const d = new Date(createdAt);
              if (Number.isNaN(d.getTime())) continue;
              daySet.add(toLocalYmd(d));
            }

            const cursor = new Date();
            cursor.setHours(0, 0, 0, 0);
            let streak = 0;
            while (daySet.has(toLocalYmd(cursor))) {
              streak += 1;
              cursor.setDate(cursor.getDate() - 1);
            }

            setConversationStreak(streak);
          }
        }
      } catch {
        if (!cancelled) setConversationStreak(0);
      }

      // Best-effort: only works if you have a profile views table.
      try {
        const { count, error } = await supabase
          .from('profile_views')
          .select('id', { count: 'exact', head: true })
          .eq('viewed_profile_id', myProfileId)
          .gte('created_at', weekStartIso);

        if (!cancelled) setProfileViews(!error && typeof count === 'number' ? count : 0);
      } catch {
        if (!cancelled) setProfileViews(0);
      }
    };

    void refreshWeekInNumbers();

    const channel = supabase
      .channel(`weekstats:${user.id}:${myProfileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swipes', filter: `target_id=eq.${myProfileId}` },
        () => void refreshWeekInNumbers(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => void refreshWeekInNumbers(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` },
        () => void refreshWeekInNumbers(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profile_views', filter: `viewed_profile_id=eq.${myProfileId}` },
        () => void refreshWeekInNumbers(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id, myProfileId]);

  const startOfTodayIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const [matchesTodayPeople, setMatchesTodayPeople] = useState<DashboardPerson[]>([]);

  useEffect(() => {
    if (!myProfileId) {
      setMatchesTodayCount(0);
      setMatchesTodayPeople([]);
      return;
    }

    let cancelled = false;

    const fetchMatchesToday = async () => {
      try {
        const { data: matches, error } = await supabase
          .from('matches')
          .select('id,user1_id,user2_id,status,created_at')
          .eq('status', 'ACCEPTED')
          .gte('created_at', startOfTodayIso)
          .or(`user1_id.eq.${myProfileId},user2_id.eq.${myProfileId}`)
          .order('created_at', { ascending: false })
          .limit(25);

        if (cancelled) return;
        if (error || !matches) {
          setMatchesTodayCount(0);
          setMatchesTodayPeople([]);
          return;
        }

        const rows = matches as any[];
        const otherProfileIds = Array.from(
          new Set(
            rows
              .map((m) => {
                const otherId = m.user1_id === myProfileId ? m.user2_id : m.user1_id;
                return typeof otherId === 'string' ? otherId : null;
              })
              .filter((v): v is string => Boolean(v)),
          ),
        );

        setMatchesTodayCount(otherProfileIds.length);
        if (otherProfileIds.length === 0) {
          setMatchesTodayPeople([]);
          return;
        }

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id,full_name,avatar_url')
          .in('id', otherProfileIds);

        if (cancelled) return;
        if (profilesError || !profilesData) {
          setMatchesTodayPeople([]);
          return;
        }

        const profileById = new Map<string, any>();
        (profilesData as any[]).forEach((p) => {
          if (p?.id) profileById.set(p.id, p);
        });

        const list: DashboardPerson[] = otherProfileIds
          .map((pid) => {
            const p = profileById.get(pid);
            return {
              userId: pid,
              name: (p?.full_name || '').trim() || 'Match',
              avatarUrl: p?.avatar_url ?? null,
              unread: 0,
              lastMessage: '',
            };
          })
          .slice(0, 10);

        setMatchesTodayPeople(list);
      } catch {
        if (!cancelled) {
          setMatchesTodayCount(0);
          setMatchesTodayPeople([]);
        }
      }
    };

    void fetchMatchesToday();

    const channel = supabase
      .channel(`matches:dashboard:${myProfileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `user1_id=eq.${myProfileId}` },
        () => void fetchMatchesToday(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `user2_id=eq.${myProfileId}` },
        () => void fetchMatchesToday(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [myProfileId, startOfTodayIso]);

  type DashboardPerson = {
    userId: string;
    profileId?: string;
    name: string;
    avatarUrl?: string | null;
    unread: number;
    lastMessage: string;
    lastMessageAt?: string;
  };

  const [recentPeople, setRecentPeople] = useState<DashboardPerson[]>([]);

  type DashboardActivityItem = {
    id: string;
    type: string;
    actorId?: string | null;
    title: string;
    body: string;
    actorAvatar?: string | null;
    createdAt: string;
    readAt?: string | null;
    actionRequired?: boolean;
  };

  const [recentActivity, setRecentActivity] = useState<DashboardActivityItem[]>([]);

  useEffect(() => {
    if (!user?.id) {
      setRecentPeople([]);
      return;
    }

    let cancelled = false;

    const getMessagePreview = (message: any) => {
      const type = message?.message_type ?? 'text';
      if (message?.is_view_once && (type === 'image' || type === 'video')) {
        return type === 'video' ? 'View once video' : 'View once photo';
      }
      switch (type) {
        case 'voice':
          return 'Voice message';
        case 'image':
          return 'Photo';
        case 'video':
          return 'Video';
        case 'document':
          return 'Document';
        case 'location':
          return 'Location';
        case 'mood_sticker':
          return 'Sticker';
        default:
          return typeof message?.text === 'string' ? message.text : '';
      }
    };

    const fetchRecentPeople = async () => {
      try {
        const { data: messages, error } = await supabase
          .from('messages')
          .select('id,text,created_at,sender_id,receiver_id,is_read,message_type,is_view_once')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(200);

        if (cancelled) return;
        if (error || !messages) {
          setRecentPeople([]);
          return;
        }

        const rows = messages as any[];
        const convoMap = new Map<string, { lastText: string; lastAt: string; unread: number }>();

        for (const msg of rows) {
          const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
          if (!otherId) continue;

          if (!convoMap.has(otherId)) {
            convoMap.set(otherId, {
              lastText: getMessagePreview(msg),
              lastAt: typeof msg.created_at === 'string' ? msg.created_at : '',
              unread: 0,
            });
          }

          if (msg.receiver_id === user.id && !msg.is_read) {
            const entry = convoMap.get(otherId);
            if (entry) entry.unread += 1;
          }
        }

        const otherUserIds = Array.from(convoMap.keys());
        if (otherUserIds.length === 0) {
          setRecentPeople([]);
          return;
        }

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,avatar_url')
          .in('user_id', otherUserIds);

        if (cancelled) return;
        if (profilesError || !profilesData) {
          setRecentPeople([]);
          return;
        }

        const profileByUserId = new Map<string, any>();
        (profilesData as any[]).forEach((p) => {
          if (p?.user_id) profileByUserId.set(p.user_id, p);
        });

        const list: DashboardPerson[] = otherUserIds
          .map((otherId) => {
            const p = profileByUserId.get(otherId);
            const meta = convoMap.get(otherId);
            return {
              userId: otherId,
              profileId: typeof p?.id === 'string' ? p.id : undefined,
              name: (p?.full_name || '').trim() || 'Match',
              avatarUrl: p?.avatar_url ?? null,
              unread: meta?.unread ?? 0,
              lastMessage: (meta?.lastText || '').trim(),
              lastMessageAt: meta?.lastAt,
            };
          })
          .slice(0, 10);

        setRecentPeople(list);
      } catch {
        if (!cancelled) setRecentPeople([]);
      }
    };

    void fetchRecentPeople();

    const channel = supabase
      .channel(`messages:dashboard:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => void fetchRecentPeople(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` },
        () => void fetchRecentPeople(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setRecentActivity([]);
      return;
    }

    let cancelled = false;

    const fetchRecentActivity = async () => {
      try {
        const { data: inboxItems } = await supabase
          .from('inbox_items')
          .select('id,type,actor_id,title,body,created_at,read_at,action_required')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(12);

        if (cancelled) return;

        const rows = (inboxItems || []) as any[];
        const senderIds = Array.from(
          new Set(
            rows
              .map((row) => (typeof row?.actor_id === 'string' ? row.actor_id : null))
              .filter((v): v is string => Boolean(v)),
          ),
        );

        const profileById = new Map<string, any>();
        if (senderIds.length) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id,full_name,avatar_url')
            .in('id', senderIds);
          (profilesData || []).forEach((p: any) => {
            if (p?.id) profileById.set(p.id, p);
          });
        }

        const items: DashboardActivityItem[] = rows
          .map((row) => {
            const profile = profileById.get(row.actor_id);
            return {
              id: String(row.id),
              type: String(row.type || ''),
              actorId: row.actor_id ?? null,
              title: (row.title || '').trim() || 'Recent activity',
              body: (row.body || '').trim() || 'New update',
              actorAvatar: profile?.avatar_url ?? null,
              createdAt: row.created_at,
              readAt: row.read_at ?? null,
              actionRequired: Boolean(row.action_required),
            };
          })
          .sort((a, b) => {
            const aNeeds = a.actionRequired ? 1 : 0;
            const bNeeds = b.actionRequired ? 1 : 0;
            if (aNeeds !== bNeeds) return bNeeds - aNeeds;
            const aUnread = a.readAt ? 0 : 1;
            const bUnread = b.readAt ? 0 : 1;
            if (aUnread !== bUnread) return bUnread - aUnread;
            return Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
          })
          .slice(0, 3);

        setRecentActivity(items);
      } catch {
        if (!cancelled) setRecentActivity([]);
      }
    };

    void fetchRecentActivity();

    const channel = supabase
      .channel(`inbox-preview:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_items', filter: `user_id=eq.${user.id}` },
        () => void fetchRecentActivity(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const badges = [
    { name: "First Match", icon: "??", earned: true },
    { name: "Chatterbox", icon: "??", earned: true },
    { name: "Consistent", icon: "??", earned: false },
  ];

  const goToExplore = () => router.push("/(tabs)/explore");
  const goToActivity = () => router.push("/(tabs)/activity");
  const goToChat = () => router.push("/(tabs)/chat");
  const goToProfile = () => router.push("/(tabs)/profile");
  const openProfileView = (profileId?: string | null) => {
    if (!profileId) return;
    router.push({ pathname: '/profile-view', params: { profileId: String(profileId) } });
  };

  const CardChrome = () => (
    <>
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={isDark ? 16 : 22}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 20 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[withAlpha(theme.text, isDark ? 0.08 : 0.05), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 20 }]}
        pointerEvents="none"
      />
    </>
  );

  const ProfileSnapshotCard = () => (
    <TouchableOpacity style={styles.card} activeOpacity={0.92} onPress={goToProfile}>
      <CardChrome />
      <View style={styles.profileHeader}>
        <View style={styles.profilePhotoContainer}>
          <Image
            source={avatarSource}
            style={styles.profilePhoto}
          />
          <View style={[styles.onlineRing, { borderColor: isOnline ? theme.secondary : theme.textMuted }]} />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.lastActive}>{isOnline ? 'Active now' : 'Offline'}</Text>
          <View style={styles.moodContainer}>
            <Text style={styles.moodSticker}>??</Text>
            <Text style={styles.moodText}>Happy vibes</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.completionBar}>
        <View style={styles.completionHeader}>
          <Text style={styles.completionText}>Profile: {profileCompletion}%</Text>
          <Text style={styles.completionSuggestion}>{completionSuggestion}</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${profileCompletion}%` }]} />
        </View>
      </View>
    </TouchableOpacity>
  );

  const MatchesOverviewCard = () => (
    <View style={styles.card}>
      <CardChrome />
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>New Matches Today</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{matchesTodayCount}</Text>
        </View>
      </View>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.matchesScroll}>
        {matchesTodayPeople.map((match) => (
          <TouchableOpacity
            key={match.userId}
            style={styles.matchItem}
            activeOpacity={0.92}
            onPress={() => openProfileView(match.userId)}
          >
            <View style={styles.matchPhotoContainer}>
              {match.avatarUrl ? (
                <Image source={{ uri: match.avatarUrl }} style={styles.matchAvatar} />
              ) : (
                <View style={styles.matchAvatarFallback}>
                  <Text style={styles.matchAvatarFallbackText}>{getInitials(match.name)}</Text>
                </View>
              )}
              {match.unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{match.unread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.matchName}>{match.name}</Text>
            <View style={styles.matchActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openProfileView(match.userId)}>
                <MaterialCommunityIcons name="message" size={16} color={Colors.light.background} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openProfileView(match.userId)}>
                <MaterialCommunityIcons name="heart" size={16} color={theme.tint} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const LikesSuperlikesCard = () => (
    <View style={styles.card}>
      <CardChrome />
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Likes / Superlikes</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{likesSuperlikesToday}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.matchesScroll}>
        {recentPeople.map((match) => (
          <TouchableOpacity
            key={match.profileId || match.userId}
            style={styles.matchItem}
            activeOpacity={0.92}
            onPress={() => openProfileView(match.profileId)}
          >
            <View style={styles.matchPhotoContainer}>
              {match.avatarUrl ? (
                <Image source={{ uri: match.avatarUrl }} style={styles.matchAvatar} />
              ) : (
                <View style={styles.matchAvatarFallback}>
                  <Text style={styles.matchAvatarFallbackText}>{getInitials(match.name)}</Text>
                </View>
              )}
              {match.unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{match.unread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.matchName}>{match.name}</Text>
            <View style={styles.matchActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openProfileView(match.profileId)}>
                <MaterialCommunityIcons name="heart" size={16} color={Colors.light.background} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openProfileView(match.profileId)}>
                <MaterialCommunityIcons name="star" size={16} color={Colors.light.background} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const MessagingSnapshotCard = () => (
    <View style={styles.card}>
      <CardChrome />
      <Text style={styles.cardTitle}>Recent Conversations</Text>
      {recentPeople.slice(0, 3).map((match) => (
        <TouchableOpacity
          key={match.profileId || match.userId}
          style={styles.conversationItem}
          onPress={() => openProfileView(match.profileId)}
        >
          {match.avatarUrl ? (
            <Image source={{ uri: match.avatarUrl }} style={styles.conversationAvatar} />
          ) : (
            <View style={styles.conversationAvatarFallback}>
              <Text style={styles.conversationAvatarFallbackText}>{getInitials(match.name)}</Text>
            </View>
          )}
          <View style={styles.conversationInfo}>
            <View style={styles.conversationHeader}>
              <Text style={styles.conversationName}>{match.name}</Text>
              <View style={styles.statusIndicator}>
                <Text style={styles.statusIcon}>?</Text>
              </View>
            </View>
            <Text style={styles.lastMessage}>{match.lastMessage || 'Say hi ??'}</Text>
          </View>
          {match.unread > 0 ? <View style={styles.unreadDot} /> : null}
        </TouchableOpacity>
      ))}
      
      <View style={styles.moodStickersBar}>
        <Text style={styles.moodStickersTitle}>Quick Send:</Text>
        <View style={styles.moodStickers}>
          {["??", "??", "??", "??", "??"].map((sticker, index) => (
            <TouchableOpacity key={index} style={styles.moodStickerBtn} onPress={goToChat}>
              <Text style={styles.moodStickerText}>{sticker}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const NotesGiftsCard = () => (
    <View style={styles.card}>
      <CardChrome />
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Recent Activity</Text>
        <TouchableOpacity style={styles.viewAllButton} onPress={goToActivity}>
          <Text style={styles.viewAllText}>View all</Text>
        </TouchableOpacity>
      </View>
      {recentActivity.length === 0 ? (
        <Text style={styles.emptyStateText}>Your latest activity will show here.</Text>
      ) : (
        recentActivity.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.activityRow}
            onPress={() => openProfileView(item.actorId ?? null)}
          >
            {item.actorAvatar ? (
              <Image source={{ uri: item.actorAvatar }} style={styles.activityAvatar} />
            ) : (
              <View style={styles.activityAvatarFallback}>
                <Text style={styles.activityAvatarFallbackText}>{getInitials(item.title)}</Text>
              </View>
            )}
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>{item.title}</Text>
              <Text numberOfLines={2} style={styles.activityBody}>
                {item.body}
              </Text>
            </View>
            <View style={styles.activityBadge}>
              <MaterialCommunityIcons
                name="bell-outline"
                size={18}
                color={theme.tint}
              />
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const EngagementInsightsCard = () => (
    <View style={styles.card}>
      <CardChrome />
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
        <Text style={styles.streakText}>
          {"You've messaged "}{(recentPeople[0]?.name || "a match")} {conversationStreak}{" days in a row!"}
        </Text>
      </View>
    </View>
  );

  const DiscoverSection = () => (
    <View style={styles.card}>
      <CardChrome />
      <Text style={styles.cardTitle}>Discover New Matches</Text>
      <View style={styles.discoverCategories}>
        <TouchableOpacity style={styles.discoverCategory} onPress={goToExplore}>
          <MaterialCommunityIcons name="map-marker" size={20} color={theme.secondary} />
          <Text style={styles.categoryText}>Most Active Near You</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.discoverCategory} onPress={goToExplore}>
          <MaterialCommunityIcons name="star" size={20} color={theme.accent} />
          <Text style={styles.categoryText}>New Users</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.discoverCategory} onPress={goToExplore}>
          <MaterialCommunityIcons name="account-group" size={20} color={theme.tint} />
          <Text style={styles.categoryText}>Similar Interests</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity 
        style={styles.swipeButton}
        onPress={goToExplore}
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
      <CardChrome />
      <Text style={styles.cardTitle}>Boosts & Features</Text>
      <View style={styles.boostInfo}>
        <View style={styles.boostItem}>
          <MaterialCommunityIcons name="rocket" size={24} color={theme.accent} />
          <Text style={styles.boostText}>{boostsLeft} Free Boosts Left</Text>
        </View>
        <TouchableOpacity style={styles.superLikeBtn} onPress={goToExplore}>
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
      <CardChrome />
      <Text style={styles.cardTitle}>Safety & Wellness</Text>
      <View style={styles.safetyTip}>
        <MaterialCommunityIcons name="lightbulb" size={20} color={theme.accent} />
        <Text style={styles.safetyText}>?? Never share financial info with matches</Text>
      </View>
      <View style={styles.safetyActions}>
        <TouchableOpacity style={styles.safetyBtn} onPress={goToProfile}>
          <MaterialCommunityIcons name="shield-check" size={16} color={theme.secondary} />
          <Text style={styles.safetyBtnText}>Available</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.safetyBtn} onPress={goToProfile}>
          <MaterialCommunityIcons name="block-helper" size={16} color={theme.tint} />
          <Text style={styles.safetyBtnText}>Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const GamificationCard = () => (
    <View style={styles.card}>
      <CardChrome />
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
            <CardChrome />
            <Text style={styles.welcomeText}>{greeting}</Text>
            <Text style={styles.headerTitle}>Your Dashboard</Text>
            <LinearGradient
              colors={[withAlpha(theme.accent, 0.0), withAlpha(theme.accent, isDark ? 0.35 : 0.22), withAlpha(theme.accent, 0.0)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.premiumHeaderBar}
            />
          </View>

          <ProfileSnapshotCard />
          <LikesSuperlikesCard />
          <MatchesOverviewCard />
          <NotesGiftsCard />
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
      position: 'relative',
      overflow: 'hidden',
      padding: 20,
      paddingBottom: 14,
      marginHorizontal: 20,
      marginTop: 8,
      marginBottom: 16,
      borderRadius: 20,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.22 : 0.55),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.18 : 0.10,
      shadowRadius: isDark ? 14 : 10,
      elevation: isDark ? 6 : 4,
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
    premiumHeaderBar: {
      marginTop: 10,
      height: 2,
      borderRadius: 2,
      width: '56%',
    },
    card: {
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.62),
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 20,
      padding: 20,
      shadowColor: Colors.dark.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.22 : 0.14,
      shadowRadius: isDark ? 18 : 14,
      elevation: isDark ? 7 : 5,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.20 : 0.10),
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
    viewAllButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.04),
    },
    viewAllText: {
      fontSize: 12,
      color: theme.text,
      letterSpacing: 0.3,
      fontWeight: "600",
    },
    emptyStateText: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 18,
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
    matchAvatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    matchAvatarFallback: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    matchAvatarFallbackText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
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
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    activityAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginRight: 12,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    activityAvatarFallback: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginRight: 12,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityAvatarFallbackText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
    },
    activityInfo: {
      flex: 1,
    },
    activityTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
    },
    activityBody: {
      fontSize: 13,
      color: theme.textMuted,
    },
    activityBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.2 : 0.12),
    },
    conversationAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      marginRight: 12,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    conversationAvatarFallback: {
      width: 34,
      height: 34,
      borderRadius: 17,
      marginRight: 12,
      backgroundColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    conversationAvatarFallbackText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
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


