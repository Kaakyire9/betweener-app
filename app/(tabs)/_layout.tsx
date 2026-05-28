import { AuthGuard } from '@/components/auth-guard';
import { HapticTab } from '@/components/haptic-tab';
import IntentMark from '@/components/icons/IntentMark';
// import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIntentRequests } from '@/hooks/useIntentRequests';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import { ChatRepository } from '@/lib/chat/local/chat-db';
import { type ResponsiveMetrics, useResponsiveMetrics } from '@/lib/responsive';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, Sparkles, User, Users } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { setAppIconBadgeCount } from '@/lib/notifications/app-badge';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const responsive = useResponsiveMetrics();
  const styles = useMemo(() => createStyles(responsive), [responsive]);
  const { user, profile } = useAuth();
  const { profileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const { badgeCount } = useIntentRequests(profileId, {
    snapshotOwnerIds: [profileId, user?.id],
  });

  const [unreadChats, setUnreadChats] = useState(0);

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
    void setAppIconBadgeCount(unreadChats + badgeCount);
  }, [badgeCount, unreadChats]);

  // Badge component for tab notifications
  const TabBadge = ({ count }: { count: number }) => {
    if (count === 0) return null;
    
    return (
      <View style={[styles.badge, { backgroundColor: theme.tint, borderColor: theme.background }]}>
        <Text style={styles.badgeText}>
          {count > 99 ? '99+' : count.toString()}
        </Text>
      </View>
    );
  };

  return (
    <AuthGuard>
      <Tabs
        initialRouteName="vibes"
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].textMuted,
          tabBarStyle: {
            backgroundColor: Colors[colorScheme ?? 'light'].background,
            borderTopColor: Colors[colorScheme ?? 'light'].outline,
            height: responsive.bottomNavReserve,
            paddingTop: responsive.compactHeight ? 4 : 6,
            paddingBottom: Math.max(responsive.insets.bottom, responsive.compactHeight ? 6 : 8),
          },
          tabBarLabelStyle: {
            fontSize: responsive.font(11, { min: 10, max: 12 }),
            fontFamily: 'Manrope_600SemiBold',
          },
          headerShown: false,
          tabBarButton: HapticTab,
        }}>
        <Tabs.Screen
          name="vibes"
          options={{
            title: 'Vibes',
            tabBarIcon: ({ color }) => (
              <>
                <Sparkles size={responsive.compactWidth ? 24 : 26} color={color} />
                {/* <IconSymbol size={28} name="house.fill" color={color} /> */}
              </>
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
          name="explore"
          options={{
            title: 'Circles',
            tabBarIcon: ({ color }) => (
              <View style={{ position: 'relative' }}>
                <Users size={responsive.compactWidth ? 24 : 26} color={color} />
                {/* <IconSymbol size={28} name="magnifyingglass" color={color} /> */}
              </View>
            ),
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
            tabBarIcon: ({ color, focused }) => {
              const intentIconColor = colorScheme === 'light' ? theme.background : theme.text;
              return (
                <View style={styles.intentTabIconWrap}>
                  {focused ? (
                    <LinearGradient
                      colors={[theme.accent, theme.tint]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.intentGlow}
                    >
                      <IntentMark size={responsive.compactWidth ? 30 : 32} color={intentIconColor} strokeWidth={2.45} />
                    </LinearGradient>
                  ) : (
                    <View style={styles.intentInactiveIcon}>
                      <IntentMark size={responsive.compactWidth ? 28 : 30} color={color} strokeWidth={2.25} />
                    </View>
                  )}
                  {/* <IconSymbol size={28} name="bell.fill" color={color} /> */}
                  <TabBadge count={badgeCount} />
                </View>
              );
            },
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color }) => (
              <View style={{ position: 'relative' }}>
                <MessageCircle size={responsive.compactWidth ? 24 : 26} color={color} />
                {/* <IconSymbol size={28} name="message.fill" color={color} /> */}
                <TabBadge count={unreadChats} />
              </View>
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
            tabBarIcon: ({ color }) => (
              <>
                <User size={responsive.compactWidth ? 24 : 26} color={color} />
                {/* <IconSymbol size={28} name="person.fill" color={color} /> */}
              </>
            ),
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}

const createStyles = (responsive: ResponsiveMetrics) => StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ff4757',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: responsive.font(12, { min: 10, max: 12 }),
    fontWeight: 'bold',
    textAlign: 'center',
  },
  intentTabIconWrap: {
    position: 'relative',
    minWidth: responsive.compactWidth ? 34 : 38,
    minHeight: responsive.compactWidth ? 34 : 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentInactiveIcon: {
    width: responsive.compactWidth ? 34 : 36,
    height: responsive.compactWidth ? 34 : 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentGlow: {
    width: responsive.compactWidth ? 34 : 36,
    height: responsive.compactWidth ? 34 : 36,
    borderRadius: responsive.compactWidth ? 13 : 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    shadowColor: Colors.light.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
