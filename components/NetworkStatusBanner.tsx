import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type NetworkBannerState = {
  tone: 'offline' | 'weak';
  title: string;
  body: string;
};

const getBannerState = (state: NetInfoState): NetworkBannerState | null => {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return {
      tone: 'offline',
      title: 'Connection lost',
      body: 'Betweener is keeping you signed in. We will retry when the network returns.',
    };
  }

  if (state.type === 'cellular') {
    const generation = state.details?.cellularGeneration;
    if (generation === '2g' || generation === '3g') {
      return {
        tone: 'weak',
        title: 'Weak network',
        body: 'Some actions may take longer. Keep the app open while Betweener retries safely.',
      };
    }
  }

  return null;
};

export default function NetworkStatusBanner() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<NetworkBannerState | null>(null);
  const [visibleBanner, setVisibleBanner] = useState<NetworkBannerState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setBanner(getBannerState(state));
    });

    NetInfo.fetch()
      .then((state) => setBanner(getBannerState(state)))
      .catch(() => undefined);

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (banner) {
      const timer = setTimeout(() => {
        setVisibleBanner(banner);
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            speed: 14,
            bounciness: 6,
            useNativeDriver: true,
          }),
        ]).start();
      }, 900);
      return () => clearTimeout(timer);
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -12,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setVisibleBanner(null);
    });
  }, [banner, opacity, translateY]);

  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        top: insets.top + 10,
        opacity,
        transform: [{ translateY }],
      },
    ],
    [insets.top, opacity, translateY],
  );

  if (!visibleBanner) return null;

  const railColor = visibleBanner.tone === 'offline' ? '#F59E0B' : theme.tint;
  const iconName = visibleBanner.tone === 'offline' ? 'wifi-off' : 'signal-cellular-2';

  return (
    <Animated.View pointerEvents="none" style={containerStyle}>
      <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.outline, shadowColor: theme.text }]}>
        <LinearGradient
          colors={[railColor, theme.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.rail}
        />
        <View style={[styles.iconWrap, { backgroundColor: `${railColor}18`, borderColor: `${railColor}30` }]}>
          <MaterialCommunityIcons name={iconName} size={18} color={railColor} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>{visibleBanner.title}</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>{visibleBanner.body}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 850,
  },
  card: {
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    paddingLeft: 15,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 13.5,
    fontFamily: 'Archivo_700Bold',
  },
  body: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'Manrope_500Medium',
  },
});
