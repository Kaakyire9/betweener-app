import ExploreHeader from "@/components/ExploreHeader";
import type { ExploreStackHandle } from "@/components/ExploreStack.reanimated";
import ExploreStack from "@/components/ExploreStack.reanimated";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import useAIRecommendations from "@/hooks/useAIRecommendations";
import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const MOCK_MATCHES = [
  {
    id: "1",
    name: "Akosua",
    age: 24,
    tagline: "Adventure seeker & foodie",
    interests: ["Travel", "Food", "Music"],
    avatar_url:
      "https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face",
    distance: "2.3 km away",
  },
  {
    id: "2",
    name: "Kwame",
    age: 27,
    tagline: "Tech enthusiast & gym lover",
    interests: ["Technology", "Fitness"],
    avatar_url:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face",
    distance: "15.7 km away",
  },
  {
    id: "3",
    name: "Ama",
    age: 22,
    tagline: "Artist with a kind heart",
    interests: ["Art", "Nature"],
    avatar_url:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face",
    distance: "8.2 km away",
  },
];

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const fontsLoaded = useAppFonts();
  const { profile } = useAuth();

  const { matches, recordSwipe, smartCount } = useAIRecommendations(profile?.id);

  const [activeTab, setActiveTab] = useState<
    "recommended" | "nearby" | "active"
  >("recommended");
  const [currentIndex, setCurrentIndex] = useState(0);

  const stackRef = useRef<ExploreStackHandle | null>(null);
  const buttonScale = useRef(new Animated.Value(1)).current;
  // entrance animation for the floating action card
  const entranceTranslate = useRef(new Animated.Value(12)).current;
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    // subtle slide + fade entrance
    Animated.parallel([
      Animated.timing(entranceTranslate, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // -------------------------------
  // ✅ FIX: Fallback to mock matches
  // -------------------------------
  const matchList =
    matches.length > 0 ? matches : MOCK_MATCHES;

  // Reset index if data changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [matchList.length]);

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
      if (cm) recordSwipe(cm.id, "like");
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
      if (cm) recordSwipe(cm.id, "dislike");
      if (currentIndex < matchList.length - 1)
        setCurrentIndex(currentIndex + 1);
    }
    try {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium
      );
    } catch {}
  };

  const onProfileTap = (id: string) => {
    console.log("Open profile:", id);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
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
          <ExploreStack
            ref={stackRef}
            matches={matchList}
            currentIndex={currentIndex}
            setCurrentIndex={setCurrentIndex}
            recordSwipe={recordSwipe}
            onProfileTap={onProfileTap}
          />
        </View>

        {/* ACTION BUTTONS (floating card above tabs; safe-area aware) */}
        <View style={[styles.actionButtons, { bottom: Math.max(Math.max(insets.bottom, 6) - 24, 0) }]} pointerEvents="box-none">
          {/* Animated wrapper provides a subtle slide+fade entrance */}
          <Animated.View
            style={{
              width: Math.min(Math.max(280, windowWidth - 64), 420),
              opacity: entranceOpacity,
              transform: [{ translateY: entranceTranslate }],
            }}
            pointerEvents="box-none"
          >
            <BlurViewSafe
              intensity={60}
              tint="light"
              style={styles.actionFloatingCard}
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
                onPress={() => console.log("Info")}
              >
                <MaterialCommunityIcons
                  name="information"
                  size={24}
                  color={Colors.light.tint}
                />
              </TouchableOpacity>

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
        </View>
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
    paddingHorizontal: 18,
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
    marginRight: 20,
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
    marginHorizontal: 8,
  },
  likeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 20,
  },
});
