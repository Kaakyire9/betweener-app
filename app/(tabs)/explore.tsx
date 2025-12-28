import ExploreHeader from "@/components/ExploreHeader";
import type { ExploreStackHandle } from "@/components/ExploreStack.reanimated";
import ExploreStack from "@/components/ExploreStack.reanimated";
import MatchModal from '@/components/MatchModal';
import ProfileVideoModal from '@/components/ProfileVideoModal';
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import useAIRecommendations from "@/hooks/useAIRecommendations";
import { requestAndSavePreciseLocation, saveManualCityLocation } from "@/hooks/useLocationPreference";
import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe, { isLinearGradientAvailable } from "@/components/NativeWrappers/LinearGradientSafe";
import { useEffect, useRef, useState } from "react";
import { router } from 'expo-router';
import { Animated, Easing, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const fontsLoaded = useAppFonts();
  const { profile, refreshProfile } = useAuth();

  // For QA/dev: deterministic mutual-match list — replace with IDs you want to test
  const QA_MUTUAL_IDS = typeof __DEV__ !== 'undefined' && __DEV__ ? ['m-001'] : undefined;

  const { matches, recordSwipe, undoLastSwipe, refreshMatches, smartCount, lastMutualMatch, fetchProfileDetails } = useAIRecommendations(profile?.id, { mutualMatchTestIds: QA_MUTUAL_IDS });

  // celebration modal state
  const [celebrationMatch, setCelebrationMatch] = useState<any | null>(null);

  // when the hook reports a mutual match, show the celebration modal
  useEffect(() => {
    if (lastMutualMatch) {
      setCelebrationMatch(lastMutualMatch);
    }
  }, [lastMutualMatch]);

  const [activeTab, setActiveTab] = useState<
    "recommended" | "nearby" | "active"
  >("recommended");
  const [currentIndex, setCurrentIndex] = useState(0);

  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [manualLocationModalVisible, setManualLocationModalVisible] = useState(false);
  const [manualLocation, setManualLocation] = useState(profile?.location || "");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  const stackRef = useRef<ExploreStackHandle | null>(null);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const superlikePulse = useRef(new Animated.Value(0)).current;
  const [superlikesLeft, setSuperlikesLeft] = useState<number>(3);
  const particles = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  // tweak this value to move the floating action card further down (positive = more downward nudge)
  const ACTION_BOTTOM_NUDGE = 40; // previously effectively 24

  // Responsive floating action card layout helper
  const getFloatingCardLayout = (w: number) => {
    // Small phones
    if (w < 480) {
      return {
        width: Math.min(Math.max(260, w - 48), 380),
        borderRadius: 36,
        paddingHorizontal: 14,
        paddingVertical: 8,
      };
    }

    // Large phones / small tablets
    if (w < 768) {
      return {
        width: Math.min(Math.max(300, w - 64), 520),
        borderRadius: 40,
        paddingHorizontal: 18,
        paddingVertical: 10,
      };
    }

    // Medium tablets
    if (w < 1000) {
      return {
        width: Math.min(720, w - 128),
        borderRadius: 48,
        paddingHorizontal: 22,
        paddingVertical: 12,
      };
    }

    // Large tablets / desktop widths
    return {
      width: Math.min(960, Math.round(w * 0.6)),
      borderRadius: 56,
      paddingHorizontal: 28,
      paddingVertical: 14,
    };
  };

  const floatingLayout = getFloatingCardLayout(windowWidth);
  // Guarded entrance animation: use Reanimated worklets when available,
  // otherwise fallback to RN Animated (already implemented above).
  let ReanimatedModule: any = null;
  let AnimatedRe: any = null;
  let canUseReanimated = false;
  try {
    // dynamic require so bundlers don't fail in environments without the native runtime
    // @ts-ignore
    ReanimatedModule = require("react-native-reanimated");
    // prefer default export if present
    AnimatedRe = ReanimatedModule.default || ReanimatedModule;
    canUseReanimated = !!(
      ReanimatedModule &&
      typeof ReanimatedModule.useSharedValue === "function" &&
      typeof ReanimatedModule.useAnimatedStyle === "function" &&
      typeof ReanimatedModule.withTiming === "function"
    );
  } catch {}

  // fallback Animated values so the existing Animated.View path works
  const fallbackEntranceTranslate = useRef(new Animated.Value(12)).current;
  const fallbackEntranceOpacity = useRef(new Animated.Value(0)).current;

  // Reanimated shared values and animated style (only created when available)
  const rTranslate = canUseReanimated
    ? ReanimatedModule.useSharedValue(12)
    : null;
  const rOpacity = canUseReanimated
    ? ReanimatedModule.useSharedValue(0)
    : null;

  const rStyle = canUseReanimated
    ? ReanimatedModule.useAnimatedStyle(() => ({
        opacity: rOpacity.value,
        transform: [{ translateY: rTranslate.value }],
      }))
    : null;

  useEffect(() => {
    if (canUseReanimated && rTranslate && rOpacity) {
      try {
        rTranslate.value = ReanimatedModule.withTiming(0, { duration: 420 });
        rOpacity.value = ReanimatedModule.withTiming(1, { duration: 360 });
      } catch {}
      return;
    }

    // Fallback RN Animated path (existing behavior)
    Animated.parallel([
      Animated.timing(fallbackEntranceTranslate, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fallbackEntranceOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // animated wrapper component for Reanimated if available
  const AnimatedReView = canUseReanimated ? (AnimatedRe && (AnimatedRe.View || AnimatedRe)) : null;

  // Use real server-provided matches by default. Fallback to mocks only
  // when the server couldn't provide any profiles.
  const matchList = matches;

  const hasPreciseCoords = profile?.latitude != null && profile?.longitude != null;
  const hasCityOnly = !!profile?.location && profile?.location_precision === 'CITY';
  const needsLocationPrompt = !hasPreciseCoords && !hasCityOnly;

  useEffect(() => {
    setManualLocation(profile?.location || "");
  }, [profile?.location]);

  // auto-show prompt once when location is missing
  useEffect(() => {
    if (needsLocationPrompt) {
      setManualLocationModalVisible(false);
    }
  }, [needsLocationPrompt]);

  const handleUseMyLocation = async () => {
    if (!profile?.id) return;
    setIsSavingLocation(true);
    setLocationError(null);
    const res = await requestAndSavePreciseLocation(profile.id);
    if (!res.ok) {
      setLocationError('error' in res ? res.error : 'Unable to save location');
    } else {
      await refreshProfile();
      await refreshMatches();
    }
    setIsSavingLocation(false);
  };

  const handleSaveManualLocation = async () => {
    if (!profile?.id) return;
    setIsSavingLocation(true);
    setLocationError(null);
    const res = await saveManualCityLocation(profile.id, manualLocation);
    if (!res.ok) {
      setLocationError('error' in res ? res.error : 'Unable to save location');
    } else {
      setManualLocationModalVisible(false);
      await refreshProfile();
      await refreshMatches();
    }
    setIsSavingLocation(false);
  };

  // Reset index if data changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [matchList.length]);

  // Prefetch optional fields for the next N cards to improve perceived speed
  useEffect(() => {
    const N = 2;
    let mounted = true;
    (async () => {
      try {
        for (let i = 1; i <= N; i++) {
          const idx = currentIndex + i;
          const m = matchList[idx];
          if (!m) break;
          // skip if it already has the optional fields
          const hasVideo = !!((m as any).profileVideo);
          const hasPersonality = Array.isArray((m as any).personalityTags) && (m as any).personalityTags.length > 0;
          const hasInterests = Array.isArray((m as any).interests) && (m as any).interests.length > 0;
          if (!hasVideo || !hasPersonality || !hasInterests) {
            // call fetchProfileDetails to merge optional fields into matches
            await fetchProfileDetails?.(m.id);
          }
          if (!mounted) break;
        }
      } catch (e) {
        // ignore prefetch errors
      }
    })();
    return () => { mounted = false; };
  }, [currentIndex, matchList, fetchProfileDetails]);

  const exhausted = currentIndex >= matchList.length;

  function NoMoreProfiles() {
    if (canUseReanimated && ReanimatedModule && AnimatedReView) {
      const noMoreTranslate = ReanimatedModule.useSharedValue(18);
      const noMoreOpacity = ReanimatedModule.useSharedValue(0);

      useEffect(() => {
        try {
          noMoreTranslate.value = ReanimatedModule.withTiming(0, { duration: 420 });
          noMoreOpacity.value = ReanimatedModule.withTiming(1, { duration: 360 });
        } catch {}
      }, []);

      const noMoreStyle = ReanimatedModule.useAnimatedStyle(() => ({
        opacity: noMoreOpacity.value,
        transform: [{ translateY: noMoreTranslate.value }],
      }));

      return (
        // @ts-ignore - conditional AnimatedReView
        <AnimatedReView style={noMoreStyle}>
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>You’re all caught up</Text>
              <Text style={styles.emptySubtitle}>No new profiles right now — check back later or refresh for a new set.</Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity
                  style={[styles.primaryButton]}
                  onPress={() => {
                    void refreshMatches();
                    setCurrentIndex(0);
                  }}
                >
                  <Text style={styles.primaryButtonText}>Refresh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghostButton}
                  onPress={() => {
                    setActiveTab('nearby');
                  }}
                >
                  <Text style={styles.ghostButtonText}>Browse Nearby</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </AnimatedReView>
      );
    }

    // fallback Animated entrance
    const noMoreTranslate = useRef(new Animated.Value(18)).current;
    const noMoreOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(noMoreTranslate, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(noMoreOpacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, []);

    return (
      <Animated.View style={[{ transform: [{ translateY: noMoreTranslate }], opacity: noMoreOpacity }, styles.emptyStateContainer]}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptySubtitle}>No new profiles right now — check back later or refresh for a new set.</Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity
              style={[styles.primaryButton]}
              onPress={() => {
                void refreshMatches();
                setCurrentIndex(0);
              }}
            >
              <Text style={styles.primaryButtonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() => {
                setActiveTab('nearby');
              }}
            >
              <Text style={styles.ghostButtonText}>Browse Nearby</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (!fontsLoaded)
    return <SafeAreaView style={styles.container} />;

  // Buttons
  const animateButtonPress = (cb: () => void) => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start(cb);
  };

  const onLike = () => {
    try {
      stackRef.current?.performSwipe("right");
    } catch {
      const cm = matchList[currentIndex];
      if (cm) recordSwipe(cm.id, "like", currentIndex);
      if (currentIndex < matchList.length - 1)
        setCurrentIndex(currentIndex + 1);
    }
    try {
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    } catch {}
  };

  const onReject = () => {
    try {
      stackRef.current?.performSwipe("left");
    } catch {
      const cm = matchList[currentIndex];
      if (cm) recordSwipe(cm.id, "dislike", currentIndex);
      if (currentIndex < matchList.length - 1)
        setCurrentIndex(currentIndex + 1);
    }
    try {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium
      );
    } catch {}
  };

  const onProfileTap = async (id: string) => {
    try {
      // fetch optional fields on demand and merge into matches
      const updated = await fetchProfileDetails?.(id);
      const videoUrl = (updated && (updated as any).profileVideo) ? String((updated as any).profileVideo) : undefined;
      // navigate to the full profile preview screen; include videoUrl param if we have it so ProfileView can auto-play
      const params: any = { profileId: String(id) };
      if (videoUrl) params.videoUrl = videoUrl;
      router.push({ pathname: '/profile-view', params });
    } catch (e) {
      console.log('onProfileTap failed', e);
    }
  };

  const onSuperlike = () => {
    if (superlikesLeft <= 0) {
      try { Haptics.selectionAsync(); } catch {}
      return;
    }

    // decrement count (premium resource)
    setSuperlikesLeft((s) => Math.max(0, s - 1));

    // premium pulse + small confetti burst
    Animated.parallel([
      Animated.sequence([
        Animated.timing(superlikePulse, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(superlikePulse, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
      Animated.stagger(40, particles.map((p) => Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]))),
    ]).start();

    try {
      stackRef.current?.performSwipe("superlike");
    } catch {
      const cm = matchList[currentIndex];
      if (cm) recordSwipe(cm.id, "superlike", currentIndex);
      if (currentIndex < matchList.length - 1) setCurrentIndex(currentIndex + 1);
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        {/* Location prompt: prefer precise GPS; fallback to manual city */}
        {needsLocationPrompt && (
          <View style={[styles.locationBanner, { paddingTop: Math.max(insets.top, 12) }]}>
            <Text style={styles.locationTitle}>See nearby matches</Text>
            <Text style={styles.locationSubtitle}>
              Share your location for accurate distance, or enter your city instead. You can change this anytime.
            </Text>
            {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}
            <View style={styles.locationActions}>
              <TouchableOpacity
                style={[styles.locationButton, styles.locationPrimary]}
                onPress={handleUseMyLocation}
                disabled={isSavingLocation}
              >
                <Text style={styles.locationPrimaryText}>
                  {isSavingLocation ? "Saving..." : "Use my location"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.locationButton, styles.locationGhost]}
                onPress={() => setManualLocationModalVisible(true)}
                disabled={isSavingLocation}
              >
                <Text style={styles.locationGhostText}>Enter city</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TOP HEADER */}
        <ExploreHeader
          tabs={[
            { id: "recommended", label: "For You", icon: "heart" },
            { id: "nearby", label: "Nearby", icon: "map-marker" },
            { id: "active", label: "Active Now", icon: "circle" },
          ]}
          activeTab={activeTab}
          setActiveTab={(id) => setActiveTab(id as any)}
          currentIndex={currentIndex}
          total={matchList.length}
          smartCount={smartCount}
        />

        {/* CARD STACK */}
        <View style={styles.stackWrapper}>
          {!exhausted ? (
            <ExploreStack
              ref={stackRef}
              matches={matchList}
              currentIndex={currentIndex}
              setCurrentIndex={setCurrentIndex}
              recordSwipe={recordSwipe}
              onProfileTap={onProfileTap}
              onPlayPress={async (id: string) => {
                try {
                  const updated = await fetchProfileDetails?.(id);
                  const effective = updated ?? matchList.find((x) => String(x.id) === String(id));
                  if (effective && (effective as any).profileVideo) {
                    setPreviewingId(String(id));
                    setVideoModalUrl((effective as any).profileVideo as string);
                    setVideoModalVisible(true);
                    return;
                  }
                  // fallback: open profile view if no video
                  router.push({ pathname: '/profile-view', params: { profileId: String(id) } });
                } catch (e) {
                  console.log('onPlayPress failed', e);
                }
              }}
              previewingId={previewingId ?? undefined}
            />
          ) : (
            <NoMoreProfiles />
          )}
        </View>

        {/* ACTION BUTTONS (floating card above tabs; safe-area aware) */}
        <View style={[styles.actionButtons, { bottom: Math.max(Math.max(insets.bottom, 6) - ACTION_BOTTOM_NUDGE, 0) }]} pointerEvents="box-none">
            {/* Animated wrapper provides a subtle slide+fade entrance */}
            {canUseReanimated && AnimatedReView && !exhausted ? (
              // Reanimated worklet-driven entrance
              // @ts-ignore
              <AnimatedReView style={[{ width: floatingLayout.width }, rStyle]} pointerEvents="box-none">
                <BlurViewSafe
                  intensity={60}
                  tint="light"
                  style={[
                    styles.actionFloatingCard,
                    {
                      width: floatingLayout.width,
                      borderRadius: floatingLayout.borderRadius,
                      paddingHorizontal: floatingLayout.paddingHorizontal,
                      paddingVertical: floatingLayout.paddingVertical,
                    },
                  ]}
                  pointerEvents="box-none"
                >
                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => animateButtonPress(onReject)}
                      activeOpacity={0.9}
                    >
                      <MaterialCommunityIcons
                        name="close"
                        size={28}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={styles.infoButton}
                      onPress={() => {
                        const cm = matchList[currentIndex];
                        if (cm) {
                          router.push({ pathname: '/profile-view', params: { profileId: String(cm.id) } });
                        }
                      }}
                    >
                      <MaterialCommunityIcons
                        name="information"
                        size={24}
                        color={Colors.light.tint}
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Rewind button */}
                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={[styles.infoButton, { marginHorizontal: 4 }]}
                      onPress={() => {
                        animateButtonPress(() => {
                          try {
                            const restored = undoLastSwipe();
                            if (!restored) {
                              try { Haptics.selectionAsync(); } catch {}
                              return;
                            }
                            // move to the restored index and trigger the stack reveal
                            setCurrentIndex(restored.index);
                            // slight delay to ensure stack has rendered the restored card
                            setTimeout(() => {
                              try { stackRef.current?.rewind(); } catch {}
                            }, 60);
                          } catch (e) {
                            try { Haptics.selectionAsync(); } catch {}
                          }
                        });
                      }}
                      activeOpacity={0.9}
                    >
                      <MaterialCommunityIcons
                        name="rewind"
                        size={22}
                        color={Colors.light.tint}
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Superlike button */}
                  <Animated.View style={{ alignItems: 'center', marginHorizontal: 4 }}>
                    <Animated.View
                      style={{
                          position: 'absolute',
                          width: 76,
                          height: 76,
                          borderRadius: 38,
                        backgroundColor: 'rgba(59,130,246,0.14)',
                        opacity: superlikePulse,
                        transform: [{ scale: superlikePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                      }}
                    />
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => animateButtonPress(onSuperlike)}
                      >
                        <LinearGradientSafe
                          colors={["#f59e0b", "#fbbf24"]}
                          start={[0, 0]}
                          end={[1, 1]}
                          style={[styles.superlikeButton, !isLinearGradientAvailable && styles.superlikeFallback]}
                        >
                            <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                              <MaterialCommunityIcons
                                name="star"
                                size={32}
                                color="rgba(0,0,0,0.18)"
                                style={{ position: 'absolute' }}
                              />
                              <MaterialCommunityIcons name="star" size={28} color="#fff" />
                            </View>
                          <View style={styles.superlikeBadge} pointerEvents="none">
                            <Animated.Text style={styles.superlikeBadgeText}>{superlikesLeft}</Animated.Text>
                          </View>
                        </LinearGradientSafe>
                      </TouchableOpacity>
                      {/* particle/confetti render */}
                      {particles.map((p, idx) => (
                        <Animated.View
                          key={`sp-${idx}`}
                          style={{
                            position: 'absolute',
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: idx === 0 ? '#f59e0b' : idx === 1 ? '#60a5fa' : '#93c5fd',
                            transform: [
                              { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -48 - idx * 8] }) },
                              { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, (idx - 1) * 18] }) },
                              { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) },
                            ],
                            opacity: p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 0] }),
                          }}
                        />
                      ))}
                  </Animated.View>

                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={styles.likeButton}
                      onPress={() => animateButtonPress(onLike)}
                      activeOpacity={0.9}
                    >
                      <MaterialCommunityIcons
                        name="heart"
                        size={28}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </BlurViewSafe>
              </AnimatedReView>
            ) : (
              // Fallback Animated entrance
              <Animated.View
                style={{
                  width: floatingLayout.width,
                  opacity: fallbackEntranceOpacity,
                  transform: [{ translateY: fallbackEntranceTranslate }],
                }}
                pointerEvents="box-none"
              >
                <BlurViewSafe
                  intensity={60}
                  tint="light"
                  style={[
                    styles.actionFloatingCard,
                    {
                      width: floatingLayout.width,
                      borderRadius: floatingLayout.borderRadius,
                      paddingHorizontal: floatingLayout.paddingHorizontal,
                      paddingVertical: floatingLayout.paddingVertical,
                    },
                  ]}
                  pointerEvents="box-none"
                >
                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => animateButtonPress(onReject)}
                      activeOpacity={0.9}
                    >
                      <MaterialCommunityIcons
                        name="close"
                        size={28}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  <TouchableOpacity
                    style={styles.infoButton}
                    onPress={() => {
                      const cm = matchList[currentIndex];
                      if (cm) {
                        router.push({ pathname: '/profile-view', params: { profileId: String(cm.id) } });
                      }
                    }}
                  >
                    <MaterialCommunityIcons
                      name="information"
                      size={24}
                      color={Colors.light.tint}
                    />
                  </TouchableOpacity>

                  {/* Superlike button (fallback branch) */}
                  <Animated.View style={{ alignItems: 'center', marginHorizontal: 4 }}>
                    <Animated.View
                      style={{
                          position: 'absolute',
                          width: 76,
                          height: 76,
                          borderRadius: 38,
                        backgroundColor: 'rgba(59,130,246,0.14)',
                        opacity: superlikePulse,
                        transform: [{ scale: superlikePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                      }}
                    />
                    <TouchableOpacity
                      style={[styles.superlikeButton, !isLinearGradientAvailable && styles.superlikeFallback]}
                      onPress={() => animateButtonPress(onSuperlike)}
                      activeOpacity={0.9}
                    >
                        <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons
                            name="star"
                            size={32}
                            color="rgba(0,0,0,0.18)"
                            style={{ position: 'absolute' }}
                          />
                          <MaterialCommunityIcons name="star" size={28} color="#fff" />
                        </View>
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={styles.likeButton}
                      onPress={() => animateButtonPress(onLike)}
                      activeOpacity={0.9}
                    >
                      <MaterialCommunityIcons
                        name="heart"
                        size={28}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </BlurViewSafe>
              </Animated.View>
            )}
        </View>

        {/* Manual city entry modal */}
        <Modal
          visible={manualLocationModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setManualLocationModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Set your city</Text>
              <Text style={styles.modalSubtitle}>We'll use this for distance until you enable precise location.</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., Accra, Ghana"
                value={manualLocation}
                onChangeText={setManualLocation}
              />
              {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.locationButton, styles.locationGhost, { flex: 1 }]}
                  onPress={() => {
                    setManualLocationModalVisible(false);
                    setLocationError(null);
                  }}
                  disabled={isSavingLocation}
                >
                  <Text style={styles.locationGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.locationButton, styles.locationPrimary, { flex: 1 }]}
                  onPress={handleSaveManualLocation}
                  disabled={isSavingLocation}
                >
                  <Text style={styles.locationPrimaryText}>{isSavingLocation ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {/* Match celebration modal */}
        <MatchModal
          visible={!!celebrationMatch}
          match={celebrationMatch}
          onClose={() => setCelebrationMatch(null)}
          onKeepDiscovering={() => setCelebrationMatch(null)}
          onSendMessage={(m) => {
            // Navigate into the chat flow and open a conversation for the matched user
            try {
              // use expo-router's router to open the chat conversation screen
              // use matched id as conversation id for QA/testing
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { router } = require('expo-router');
              if (m?.id) {
                router.push({ pathname: '/chat/[id]', params: { id: String(m.id), userName: m.name, userAvatar: m.avatar_url, isOnline: String(!!m.isActiveNow) } });
              } else {
                router.push('/(tabs)/chat');
              }
            } catch (e) {
              console.log('Navigation to chat failed', e);
            }
            setCelebrationMatch(null);
          }}
        />
        <ProfileVideoModal
          visible={videoModalVisible}
          videoUrl={videoModalUrl ?? undefined}
          onClose={() => {
            setVideoModalVisible(false);
            setVideoModalUrl(null);
            setPreviewingId(null);
          }}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  stackWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    // leave room at the bottom for action buttons
    paddingBottom: 120,
  },
  actionButtons: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0, // sit the buttons down in the gap above the tab bar
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingVertical: 20,
    backgroundColor: "transparent",
    // Ensure action buttons sit above the card stack
    zIndex: 10000,
    elevation: 40,
  },
  actionFloatingCard: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.85)',
    // subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 10,
  },
  rejectButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    marginHorizontal: 4,
  },
  likeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  superlikeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    // background will be a gradient via LinearGradientSafe
    justifyContent: "center",
    alignItems: "center",
  },
  superlikeFallback: {
    backgroundColor: '#f59e0b',
  },
  superlikeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  superlikeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    width: '86%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 10,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
  emptyActions: { flexDirection: 'row', width: '100%', justifyContent: 'center' },
  primaryButton: { backgroundColor: Colors.light.tint, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginRight: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  ghostButton: { borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  ghostButtonText: { color: '#374151', fontWeight: '600' },
  locationBanner: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  locationTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  locationSubtitle: { fontSize: 13, color: '#4b5563', marginBottom: 10 },
  locationActions: { flexDirection: 'row', alignItems: 'center' },
  locationButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  locationPrimary: { backgroundColor: Colors.light.tint, marginRight: 8 },
  locationPrimaryText: { color: '#fff', fontWeight: '700' },
  locationGhost: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  locationGhostText: { color: '#0f172a', fontWeight: '600' },
  locationError: { color: '#b91c1c', marginTop: 6, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: '#4b5563', marginBottom: 14 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', marginTop: 16 },
});
