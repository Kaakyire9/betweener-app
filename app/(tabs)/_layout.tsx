import { AuthGuard } from '@/components/auth-guard';
import { HapticTab } from '@/components/haptic-tab';
// import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIntentRequests } from '@/hooks/useIntentRequests';
import { useAuth } from '@/lib/auth-context';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, Sparkles, Target, User, Users } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const { badgeCount } = useIntentRequests(user?.id ?? null);
  
  // Mock notification counts - in a real app, these would come from your state management
  const [unreadMessages, setUnreadMessages] = useState(3);
  const [newMatches, setNewMatches] = useState(2);
  
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
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].textMuted,
          tabBarStyle: {
            backgroundColor: Colors[colorScheme ?? 'light'].background,
            borderTopColor: Colors[colorScheme ?? 'light'].outline,
          },
          sceneStyle: {
            backgroundColor: Colors[colorScheme ?? 'light'].background,
          },
          headerShown: false,
          tabBarButton: HapticTab,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Vibes',
            tabBarIcon: ({ color }) => (
              <>
                <Sparkles size={26} color={color} />
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
                <Users size={26} color={color} />
                {/* <IconSymbol size={28} name="magnifyingglass" color={color} /> */}
                <TabBadge count={newMatches} />
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
          name="chat"
          options={{
            title: 'Lounge',
            tabBarIcon: ({ color }) => (
              <View style={{ position: 'relative' }}>
                <MessageCircle size={26} color={color} />
                {/* <IconSymbol size={28} name="message.fill" color={color} /> */}
                <TabBadge count={unreadMessages} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="intent"
          options={{
            title: 'Intent',
            tabBarIcon: ({ color, focused }) => {
              const intentIconColor = colorScheme === 'light' ? theme.background : theme.text;
              return (
                <View style={{ position: 'relative' }}>
                  {focused ? (
                    <LinearGradient
                      colors={[theme.accent, theme.tint]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.intentGlow}
                    >
                      <Target size={32} color={intentIconColor} strokeWidth={2.6} />
                    </LinearGradient>
                  ) : (
                    <Target size={30} color={color} strokeWidth={2.3} />
                  )}
                  {/* <IconSymbol size={28} name="bell.fill" color={color} /> */}
                  <TabBadge count={badgeCount} />
                </View>
              );
            },
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
                <User size={26} color={color} />
                {/* <IconSymbol size={28} name="person.fill" color={color} /> */}
              </>
            ),
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  intentGlow: {
    width: 36,
    height: 36,
    borderRadius: 14,
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
