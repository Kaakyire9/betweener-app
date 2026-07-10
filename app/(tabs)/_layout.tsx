import { AuthGuard } from '@/components/auth-guard';
import IntentMark from '@/components/icons/IntentMark';
import PremiumBottomTabBar from '@/components/navigation/PremiumBottomTabBar';
import { Colors } from '@/constants/theme';
import { useInbox } from '@/hooks/useInbox';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIntentRequests } from '@/hooks/useIntentRequests';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import { ChatRepository } from '@/lib/chat/local/chat-db';
import { useCircleInvitationCount } from '@/lib/circles/use-circle-invitation-count';
import {
  getInsightsInboxActivityItems,
  getMeInboxActivityItems,
  getMomentsInboxActivityItems,
} from '@/lib/inbox/badge-groups';
import { useResponsiveMetrics } from '@/lib/responsive';
import { setAppIconBadgeCount } from '@/lib/notifications/app-badge';
import { Tabs } from 'expo-router';
import { MessageCircle, Sparkles, User, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';

const withAlpha = (hex: string | undefined | null, alpha: string) => `${hex ?? '#000000'}${alpha}`;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const responsive = useResponsiveMetrics();
  const isDark = (colorScheme ?? 'light') === 'dark';
  const { user, profile } = useAuth();
  const { profileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const { badgeCount, freshness: intentFreshness } = useIntentRequests(profileId, {
    snapshotOwnerIds: [profileId, user?.id],
  });
  const { items: inboxItems, freshness: inboxFreshness } = useInbox(user?.id ?? null);
  const { count: circleInvitationCount } = useCircleInvitationCount(profileId);

  const [unreadChats, setUnreadChats] = useState(0);

  const insightsInboxActivityItems = getInsightsInboxActivityItems(inboxItems);
  const momentsInboxActivityItems = getMomentsInboxActivityItems(inboxItems);
  const meInboxActivityItems = getMeInboxActivityItems(inboxItems);
  const trustedIntentBadgeCount = intentFreshness.hasFreshServerData ? badgeCount : 0;
  const trustedInsightsBadgeCount = inboxFreshness.hasFreshServerData ? insightsInboxActivityItems.length : 0;
  const trustedMomentsBadgeCount = inboxFreshness.hasFreshServerData ? momentsInboxActivityItems.length : 0;
  const trustedMeBadgeCount = inboxFreshness.hasFreshServerData ? meInboxActivityItems.length : 0;

  useEffect(() => {
    const myUserId = user?.id ?? null;
    if (!myUserId) {
      setUnreadChats(0);
      void setAppIconBadgeCount(0);
      return;
    }

    let cancelled = false;

    const refreshUnreadChats = async () => {
      try {
        const threads = await ChatRepository.getThreads(myUserId, { includeArchived: true, limit: 500 });
        if (cancelled) return;
        setUnreadChats(
          threads.filter((thread) => thread.is_archived === 0 && Number(thread.unread_count) > 0).length,
        );
      } catch {
        if (cancelled) return;
        setUnreadChats(0);
      }
    };

    void refreshUnreadChats();

    const unsubscribe = ChatRepository.observeThreads(myUserId, () => {
      void refreshUnreadChats();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    const nextBadgeCount =
      unreadChats +
      trustedIntentBadgeCount +
      circleInvitationCount +
      trustedInsightsBadgeCount +
      trustedMomentsBadgeCount +
      trustedMeBadgeCount;

    void setAppIconBadgeCount(nextBadgeCount);
  }, [
    circleInvitationCount,
    trustedInsightsBadgeCount,
    trustedIntentBadgeCount,
    trustedMomentsBadgeCount,
    trustedMeBadgeCount,
    unreadChats,
  ]);

  const activeTint = theme.tint;
  const inactiveTint = isDark ? withAlpha(theme.textMuted, 'C8') : '#6E7774';

  return (
    <AuthGuard>
      <Tabs
        initialRouteName="vibes"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: activeTint,
          tabBarInactiveTintColor: inactiveTint,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
          },
        }}
        tabBar={(props) => (
          <PremiumBottomTabBar
            {...props}
            badgeCounts={{
              vibes: trustedMomentsBadgeCount,
              circles: circleInvitationCount,
              intent: badgeCount,
              chat: unreadChats,
              profile: trustedMeBadgeCount,
            }}
            isDark={isDark}
            responsive={responsive}
            theme={theme}
          />
        )}
      >
        <Tabs.Screen
          name="vibes"
          options={{
            title: 'Vibes',
            tabBarIcon: ({ color, size, focused }) => (
              <Sparkles
                size={focused ? Math.max(size, responsive.compactWidth ? 25 : 27) : size}
                color={color}
                strokeWidth={focused ? 2.2 : 2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="_vibes"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="circles"
          options={{
            title: 'Circles',
            tabBarIcon: ({ color, size, focused }) => (
              <Users
                size={focused ? Math.max(size, responsive.compactWidth ? 25 : 27) : size}
                color={color}
                strokeWidth={focused ? 2.1 : 1.95}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_dashboard"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="intent"
          options={{
            title: 'Intent',
            tabBarIcon: ({ color, focused }) => (
              <IntentMark
                size={focused ? (responsive.compactWidth ? 28 : 30) : responsive.compactWidth ? 26 : 28}
                color={color}
                strokeWidth={focused ? 2.3 : 2.1}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color, size, focused }) => (
              <MessageCircle
                size={focused ? Math.max(size, responsive.compactWidth ? 25 : 27) : size}
                color={color}
                strokeWidth={focused ? 2.1 : 1.95}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Me',
            tabBarIcon: ({ color, size, focused }) => (
              <User
                size={focused ? Math.max(size, responsive.compactWidth ? 25 : 27) : size}
                color={color}
                strokeWidth={focused ? 2.1 : 1.95}
              />
            ),
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}
