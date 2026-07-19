import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { Colors } from '@/constants/theme';
import type { ResponsiveMetrics } from '@/lib/responsive';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import type { ComponentProps } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type ThemeColors = typeof Colors.light;

type TabsProps = ComponentProps<typeof Tabs>;
type BottomTabBarConfig = Parameters<NonNullable<TabsProps['tabBar']>>[0];

type PremiumBottomTabBarProps = BottomTabBarConfig & {
  isDark: boolean;
  responsive: ResponsiveMetrics;
  theme: ThemeColors;
  badgeCounts?: Partial<Record<string, number>>;
};

const withAlpha = (hex: string | undefined | null, alpha: string) => `${hex ?? '#000000'}${alpha}`;

type VisibleRoute = {
  route: BottomTabBarConfig['state']['routes'][number];
  index: number;
  options: BottomTabBarConfig['descriptors'][string]['options'];
};

type PremiumTabItemProps = {
  route: VisibleRoute['route'];
  options: VisibleRoute['options'];
  focused: boolean;
  theme: ThemeColors;
  responsive: ResponsiveMetrics;
  isDark: boolean;
  badgeCount: number;
  onPress: () => void;
  onLongPress: () => void;
};

const PremiumTabItem = memo(function PremiumTabItem({
  route,
  options,
  focused,
  theme,
  responsive,
  isDark,
  badgeCount,
  onPress,
  onLongPress,
}: PremiumTabItemProps) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const activeProgress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(activeProgress, {
      toValue: focused ? 1 : 0,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeProgress, focused]);

  const label =
    typeof options.tabBarLabel === 'string'
      ? options.tabBarLabel
      : typeof options.title === 'string'
        ? options.title
        : route.name === 'profile'
          ? 'Me'
          : route.name.charAt(0).toUpperCase() + route.name.slice(1);

  const activeTint = theme.tint;
  const inactiveTint = isDark ? withAlpha('#F4EBDD', '80') : withAlpha('#071E22', '85');
  const iconColor = focused ? activeTint : inactiveTint;
  const iconSize = responsive.compactWidth ? 25 : 26;
  const badgeLabel = badgeCount > 9 ? '9+' : String(badgeCount);
  const accessibilityLabelBase =
    options.tabBarAccessibilityLabel ?? `${typeof label === 'string' ? label : route.name} tab`;
  const accessibilityLabel =
    badgeCount > 0
      ? route.name === 'chat'
        ? `${accessibilityLabelBase}, ${badgeCount > 9 ? '9 plus unread messages' : `${badgeCount} unread ${badgeCount === 1 ? 'message' : 'messages'}`}`
        : `${accessibilityLabelBase}, ${badgeLabel} unread`
      : accessibilityLabelBase;

  const icon =
    typeof options.tabBarIcon === 'function'
      ? options.tabBarIcon({
          focused,
          color: iconColor,
          size: iconSize,
        })
      : null;

  const activePillStyle = useMemo(
    () => ({
      opacity: activeProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          scale: activeProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.94, 1],
          }),
        },
        {
          translateY: activeProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [2, 0],
          }),
        },
      ],
    }),
    [activeProgress],
  );

  const labelStyle = useMemo(
    () => ({
      color: focused ? activeTint : inactiveTint,
      opacity: activeProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.76, 1],
      }),
    }),
    [activeProgress, activeTint, focused, inactiveTint],
  );

  const labelTextStyle = {
    fontSize: responsive.font(11.15, { min: 10.75, max: 11.6 }),
    letterSpacing: 0,
    textShadowColor: focused
      ? isDark
        ? withAlpha(theme.tint, '2E')
        : withAlpha(theme.tint, '12')
      : 'transparent',
  };

  const activePillVisualStyle =
    Platform.OS === 'android'
      ? {
          backgroundColor: isDark ? withAlpha(theme.tint, '10') : withAlpha(theme.tint, '12'),
          borderColor: isDark ? withAlpha('#E8D8FF', '28') : withAlpha(theme.tint, '1A'),
          borderWidth: 1,
          shadowOpacity: 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
          elevation: 0,
        }
      : {
          backgroundColor: isDark ? withAlpha(theme.tint, '12') : withAlpha(theme.tint, '10'),
          borderColor: isDark ? withAlpha('#E8D8FF', '30') : withAlpha(theme.tint, '20'),
          borderWidth: 1,
          shadowOpacity: isDark ? 0.08 : 0.07,
          shadowRadius: isDark ? 12 : 10,
          shadowOffset: { width: 0, height: isDark ? 5 : 4 },
        };

  const focusedIconInnerStyle =
    Platform.OS === 'android'
      ? {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
          minWidth: 0,
          minHeight: 0,
          paddingHorizontal: 0,
        }
      : {
          backgroundColor: isDark
            ? withAlpha('#FFFFFF', '07')
            : withAlpha('#FFFFFF', '26'),
          borderColor: isDark
            ? withAlpha('#FFFFFF', '0E')
            : withAlpha('#FFFFFF', '40'),
        };

  return (
    <View style={styles.itemSlot}>
      <Animated.View
        style={[
          styles.itemScaleWrap,
          {
            transform: [{ scale: pressScale }],
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: focused }}
          accessibilityLabel={accessibilityLabel}
          hitSlop={8}
          onLongPress={onLongPress}
          onPress={() => {
            if (!focused && Platform.OS === 'ios') {
              void Haptics.selectionAsync();
            }
            onPress();
          }}
          onPressIn={() => {
            Animated.timing(pressScale, {
              toValue: focused ? 0.985 : 0.97,
              duration: 110,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.timing(pressScale, {
              toValue: 1,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start();
          }}
          style={styles.itemPressable}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activePill,
              {
                shadowColor: theme.tint,
              },
              activePillVisualStyle,
              activePillStyle as never,
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={
                isDark
                  ? [withAlpha('#FFFFFF', '16'), withAlpha('#FFFFFF', '05'), 'transparent']
                  : [withAlpha('#FFFFFF', 'BA'), withAlpha('#FFFFFF', '32'), 'transparent']
              }
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.activePillSheen}
            />
            <View
              pointerEvents="none"
              style={[
                styles.activePillCore,
                {
                  backgroundColor: isDark
                    ? withAlpha(theme.tint, '08')
                    : withAlpha('#FFFFFF', '28'),
                },
              ]}
            />
          </Animated.View>
          <View
            style={[
              styles.itemContent,
              Platform.OS === 'android' && focused ? styles.itemContentAndroidActive : null,
            ]}
          >
            <View style={styles.iconWrap}>
              <View
                style={[
                  styles.iconInner,
                  focused
                    ? focusedIconInnerStyle
                    : {
                        backgroundColor: isDark
                          ? withAlpha('#FFFFFF', '03')
                          : withAlpha('#FFFFFF', '0A'),
                        borderColor: isDark
                          ? withAlpha('#FFFFFF', '05')
                          : withAlpha('#071E22', '0D'),
                      },
                ]}
              >
                {icon}
              </View>
              {badgeCount > 0 ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: focused
                        ? (isDark ? '#8B5CF6' : '#7C5CFF')
                        : (isDark ? '#11A8A8' : '#0F9696'),
                      borderColor: isDark ? withAlpha('#081417', 'D8') : withAlpha('#FFF8F1', 'F0'),
                      shadowColor: focused
                        ? (isDark ? '#8B5CF6' : '#7C5CFF')
                        : '#11A8A8',
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
            {Platform.OS === 'android' ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.itemLabel,
                  labelTextStyle,
                  styles.itemLabelAndroid,
                  {
                    color: focused ? activeTint : inactiveTint,
                    opacity: focused ? 1 : 0.76,
                  },
                ]}
              >
                {label}
              </Text>
            ) : (
              <Animated.Text
                numberOfLines={1}
                style={[styles.itemLabel, labelTextStyle, labelStyle as never]}
              >
                {label}
              </Animated.Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
});

export default function PremiumBottomTabBar({
  state,
  descriptors,
  navigation,
  responsive,
  theme,
  isDark,
  badgeCounts,
}: PremiumBottomTabBarProps) {
  const visibleRoutes = useMemo<VisibleRoute[]>(
    () =>
      state.routes
        .map((route, index) => ({
          route,
          index,
          options: descriptors[route.key]?.options,
        }))
        .filter(({ options }) => {
          if (!options) return false;
          const href = (options as { href?: unknown }).href;
          if (href === null) return false;
          return StyleSheet.flatten(options.tabBarItemStyle)?.display !== 'none';
        }),
    [descriptors, state.routes],
  );

  const resolvedDockHeight = responsive.compactWidth ? 58 : 64;
  const bottomGap = Math.max(responsive.insets.bottom, responsive.compactHeight ? 7 : 9);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          paddingBottom: bottomGap,
          paddingTop: responsive.compactHeight ? 2 : 4,
          paddingHorizontal: responsive.compactWidth ? 16 : 20,
        },
      ]}
    >
      <View
        style={[
          styles.dock,
          {
            minHeight: resolvedDockHeight,
            borderRadius: resolvedDockHeight / 2,
            backgroundColor: isDark ? withAlpha('#091214', 'B4') : withAlpha('#F7EEE3', 'D4'),
            borderColor: isDark ? withAlpha('#F4EBDD', '10') : withAlpha('#FFFFFF', 'D2'),
            shadowColor: isDark ? '#000000' : '#071E22',
          },
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [withAlpha('#13A8A8', '12'), withAlpha('#8B5CF6', '14'), 'transparent']
              : [withAlpha('#13A8A8', '0D'), withAlpha('#8B5CF6', '10'), 'transparent']
          }
          start={{ x: 0.08, y: 0.16 }}
          end={{ x: 0.92, y: 0.9 }}
          style={styles.rearAura}
        />
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [withAlpha('#13A8A8', '1C'), 'transparent', withAlpha('#8B5CF6', '20')]
              : [withAlpha('#13A8A8', '14'), 'transparent', withAlpha('#8B5CF6', '16')]
          }
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.edgeAura}
        />
        <BlurViewSafe
          intensity={isDark ? 26 : 34}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            styles.innerShell,
            {
              borderRadius: resolvedDockHeight / 2 - 3,
              borderColor: isDark ? withAlpha('#DACDFF', '0A') : withAlpha('#FFFFFF', '9A'),
              backgroundColor: isDark ? withAlpha('#101B25', '38') : withAlpha('#FFFDF9', '5E'),
            },
          ]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [withAlpha('#FFFFFF', '08'), withAlpha('#FFFFFF', '02'), 'transparent']
              : [withAlpha('#FFFFFF', 'B2'), withAlpha('#FFFFFF', '28'), 'transparent']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.highlight}
        />
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [withAlpha('#13A8A8', '09'), withAlpha('#8B5CF6', '08'), 'transparent']
              : [withAlpha('#13A8A8', '07'), withAlpha('#8B5CF6', '05'), 'transparent']
          }
          start={{ x: 0.14, y: 0.18 }}
          end={{ x: 0.68, y: 0.95 }}
          style={[styles.toneWash, Platform.OS === 'android' ? styles.toneWashAndroid : null]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? ['transparent', withAlpha('#091316', '0C')]
              : ['transparent', withAlpha('#DCC7B2', '10')]
          }
          start={{ x: 0.5, y: 0.35 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.depthWash}
        />
        <View
          pointerEvents="none"
          style={[
            styles.topHairline,
            {
              backgroundColor: isDark ? withAlpha('#F4EBDD', '18') : withAlpha('#FFFFFF', 'D8'),
            },
          ]}
        />
        <View style={styles.row}>
          {visibleRoutes.map(({ route, index, options }) => {
            const focused = state.index === index;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <PremiumTabItem
                key={route.key}
                badgeCount={badgeCounts?.[route.name] ?? 0}
                focused={focused}
                isDark={isDark}
                onLongPress={onLongPress}
                onPress={onPress}
                options={options}
                responsive={responsive}
                route={route}
                theme={theme}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  dock: {
    overflow: 'hidden',
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  rearAura: {
    ...StyleSheet.absoluteFill,
    opacity: 0.52,
  },
  edgeAura: {
    ...StyleSheet.absoluteFill,
    opacity: 0.82,
  },
  innerShell: {
    ...StyleSheet.absoluteFill,
    marginHorizontal: 3,
    marginVertical: 3,
    borderWidth: 1,
  },
  highlight: {
    ...StyleSheet.absoluteFill,
  },
  toneWash: {
    ...StyleSheet.absoluteFill,
    opacity: 0.28,
  },
  toneWashAndroid: {
    opacity: 0.09,
  },
  depthWash: {
    ...StyleSheet.absoluteFill,
  },
  topHairline: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    height: StyleSheet.hairlineWidth + 0.35,
    opacity: 0.72,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  itemSlot: {
    flex: 1,
  },
  itemScaleWrap: {
    flex: 1,
  },
  itemPressable: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  activePill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 16,
    elevation: Platform.OS === 'android' ? 0 : 2,
    marginHorizontal: 9,
    marginVertical: 6,
    overflow: 'hidden',
  },
  activePillSheen: {
    ...StyleSheet.absoluteFill,
  },
  activePillCore: {
    ...StyleSheet.absoluteFill,
    margin: 1,
    borderRadius: 15,
  },
  itemContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'android' ? 0 : 1,
  },
  itemContentAndroidActive: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  iconWrap: {
    position: 'relative',
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    minWidth: 24,
    minHeight: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: 0,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#071E22',
    shadowOpacity: 0.14,
    shadowRadius: 3.2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
    zIndex: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 7.6,
    fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: 0,
    textAlign: 'center',
  },
  itemLabel: {
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    includeFontPadding: false,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: Platform.OS === 'android' ? 0 : 5,
  },
  itemLabelAndroid: {
    marginTop: 1,
  },
});
