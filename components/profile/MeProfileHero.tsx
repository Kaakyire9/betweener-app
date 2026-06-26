import OfflineImage from "@/components/media/OfflineImage";
import { PremiumPlanBadge } from "@/components/PremiumPlanBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Theme = typeof Colors.light;
type PremiumPlan = React.ComponentProps<typeof PremiumPlanBadge>["plan"];
type PlaceholderPalette = {
  start: string;
  end: string;
};

const HeroVideo = ({ uri }: { uri: string }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.keepScreenOnWhilePlaying = false;
    try {
      p.play();
    } catch {}
  });

  useEffect(() => {
    try {
      player.play();
    } catch {}
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFillObject}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

type Props = {
  theme: Theme;
  isDark: boolean;
  heroVideoUrl: string | null;
  heroImageUri: string;
  hasHeroImage: boolean;
  avatarImageUri: string;
  hasAvatarImage: boolean;
  placeholderPalette: PlaceholderPalette;
  profileInitials: string;
  displayName: string;
  displayAge: string;
  verificationLevel: number;
  showPresence: boolean;
  presenceLabel: string;
  locationDisplay: string;
  personalPremiumPlan: PremiumPlan | null;
  onEditPress: () => void;
};

export default function MeProfileHero({
  theme,
  isDark,
  heroVideoUrl,
  heroImageUri,
  hasHeroImage,
  avatarImageUri,
  hasAvatarImage,
  placeholderPalette,
  profileInitials,
  displayName,
  displayAge,
  verificationLevel,
  showPresence,
  presenceLabel,
  locationDisplay,
  personalPremiumPlan,
  onEditPress,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      <View
        style={[
          styles.heroCard,
          { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
        ]}
      >
        {heroVideoUrl ? (
          <View style={styles.heroImage}>
            <HeroVideo uri={heroVideoUrl} />
            <View style={styles.heroTint} />
            <LinearGradient
              colors={["rgba(0,0,0,0.35)", "transparent"]}
              style={styles.heroTopGradient}
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.55)"]}
              style={styles.heroBottomGradient}
            />
            <View style={styles.heroVignette} pointerEvents="none" />
            <View style={styles.heroInnerStroke} pointerEvents="none" />
            <View style={styles.heroGrain} pointerEvents="none" />
            <View style={styles.heroTopRow}>
              <TouchableOpacity
                style={[
                  styles.heroEditButton,
                  {
                    backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
                    borderColor: theme.outline,
                  },
                ]}
                onPress={onEditPress}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        ) : hasHeroImage ? (
          <View style={styles.heroImage}>
            <OfflineImage
              uri={heroImageUri}
              style={styles.heroImage}
              containerStyle={styles.heroImage}
              cachePolicy="memory-disk"
            />
            <View style={styles.heroTint} />
            <LinearGradient
              colors={["rgba(0,0,0,0.35)", "transparent"]}
              style={styles.heroTopGradient}
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.55)"]}
              style={styles.heroBottomGradient}
            />
            <View style={styles.heroVignette} pointerEvents="none" />
            <View style={styles.heroInnerStroke} pointerEvents="none" />
            <View style={styles.heroGrain} pointerEvents="none" />
            <View style={styles.heroTopRow}>
              <TouchableOpacity
                style={[
                  styles.heroEditButton,
                  {
                    backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
                    borderColor: theme.outline,
                  },
                ]}
                onPress={onEditPress}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <LinearGradient
            colors={[placeholderPalette.start, placeholderPalette.end]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroImage}
          >
            <View style={styles.heroTint} />
            <View style={styles.heroVignette} pointerEvents="none" />
            <View style={styles.heroInnerStroke} pointerEvents="none" />
            <View style={styles.heroGrain} pointerEvents="none" />
            <View style={styles.heroTopRow}>
              <TouchableOpacity
                style={[
                  styles.heroEditButton,
                  {
                    backgroundColor: "rgba(255,255,255,0.14)",
                    borderColor: "rgba(255,255,255,0.24)",
                  },
                ]}
                onPress={onEditPress}
              >
                <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.heroPlaceholderContent}>
              <Text style={styles.heroPlaceholderEyebrow}>Premium presence starts here</Text>
              <Text style={styles.heroPlaceholderInitials}>{profileInitials}</Text>
              <Text style={styles.heroPlaceholderTitle}>Add a portrait that feels like you</Text>
              <Text style={styles.heroPlaceholderSubtitle}>
                Strong first photos lift trust, reply rates, and overall profile quality.
              </Text>
            </View>
          </LinearGradient>
        )}
      </View>

      <View style={styles.heroAvatarWrap}>
        <View style={styles.heroAvatarGlow} />
        <LinearGradient
          colors={[theme.tint, theme.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarRing}
        >
          <View style={[styles.avatarInner, { backgroundColor: theme.background }]}>
            {hasAvatarImage ? (
              <OfflineImage
                uri={avatarImageUri}
                style={[styles.avatar, { borderColor: theme.background }]}
                cachePolicy="memory-disk"
              />
            ) : (
              <LinearGradient
                colors={[placeholderPalette.start, placeholderPalette.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatar, styles.avatarPlaceholder]}
              >
                <Text style={styles.avatarPlaceholderInitials}>{profileInitials}</Text>
              </LinearGradient>
            )}
          </View>
        </LinearGradient>
        <TouchableOpacity
          style={styles.editAvatarButton}
          onPress={onEditPress}
        >
          <MaterialCommunityIcons name="camera" size={14} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.heroNameRow}>
        <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={2}>
          {displayName}
          {displayAge ? ` · ${displayAge}` : ""}
        </Text>
        {verificationLevel > 0 ? (
          <VerificationBadge
            level={verificationLevel}
            size="small"
            variant="betweener"
            style={styles.heroInlineVerificationBadge}
          />
        ) : null}
        {showPresence ? (
          <View
            style={[
              styles.presenceBadge,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <View style={[styles.presenceDot, { backgroundColor: theme.tint }]} />
            <Text style={[styles.presenceText, { color: theme.textMuted }]}>
              {presenceLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.heroLocationRow}>
        <MaterialCommunityIcons name="map-marker" size={16} color={theme.tint} />
        <Text style={[styles.locationText, { color: theme.textMuted }]} numberOfLines={1}>
          {locationDisplay}
        </Text>
        {personalPremiumPlan ? (
          <PremiumPlanBadge
            plan={personalPremiumPlan}
            style={styles.heroPremiumBadgeInline}
          />
        ) : null}
      </View>
    </>
  );
}

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    heroCard: {
      width: "100%",
      height: 232,
      borderRadius: 24,
      borderWidth: 1,
      overflow: "hidden",
    },
    heroTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.08)",
    },
    heroImage: {
      flex: 1,
    },
    heroTopGradient: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 96,
    },
    heroBottomGradient: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 140,
    },
    heroVignette: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.08)",
    },
    heroInnerStroke: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.65)",
    },
    heroGrain: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(255,255,255,0.02)",
    },
    heroPlaceholderContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    heroPlaceholderEyebrow: {
      fontSize: 11,
      fontFamily: "Manrope_600SemiBold",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.78)",
      marginBottom: 10,
    },
    heroPlaceholderInitials: {
      fontSize: 62,
      fontFamily: "PlayfairDisplay_700Bold",
      letterSpacing: 2,
      color: "#fff",
    },
    heroPlaceholderTitle: {
      marginTop: 10,
      fontSize: 22,
      fontFamily: "PlayfairDisplay_600SemiBold",
      color: "#fff",
      textAlign: "center",
    },
    heroPlaceholderSubtitle: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "Manrope_500Medium",
      color: "rgba(255,255,255,0.8)",
      textAlign: "center",
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    heroEditButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    heroAvatarWrap: {
      marginTop: -42,
      alignItems: "center",
      justifyContent: "center",
    },
    heroAvatarGlow: {
      position: "absolute",
      width: 116,
      height: 116,
      borderRadius: 58,
      backgroundColor: "rgba(255,255,255,0.52)",
      shadowColor: "#a78bfa",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.24,
      shadowRadius: 16,
      elevation: 8,
    },
    avatarRing: {
      padding: 3,
      borderRadius: 45,
    },
    avatarInner: {
      padding: 2,
      borderRadius: 41,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.9)",
    },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 2,
      borderColor: "#fff",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 10,
    },
    avatarPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    avatarPlaceholderInitials: {
      fontSize: 30,
      fontFamily: "PlayfairDisplay_700Bold",
      color: "#fff",
      letterSpacing: 1.4,
    },
    editAvatarButton: {
      position: "absolute",
      bottom: -2,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: Colors.light.tint,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "#fff",
    },
    heroNameRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },
    heroInlineVerificationBadge: {
      transform: [{ translateY: 1 }],
      marginHorizontal: 1,
    },
    presenceBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginLeft: 1,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    presenceDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    presenceText: {
      fontSize: 11,
      fontWeight: "700",
    },
    profileName: {
      flexShrink: 1,
      minWidth: 0,
      maxWidth: "88%",
      fontSize: 28,
      lineHeight: 33,
      fontFamily: "PlayfairDisplay_700Bold",
      textAlign: "center",
      letterSpacing: 0.4,
    },
    heroLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 4,
      flexWrap: "wrap",
    },
    locationText: {
      flexShrink: 1,
      fontSize: 12.5,
      fontFamily: "Manrope_400Regular",
    },
    heroPremiumBadgeInline: {
      marginLeft: 2,
    },
  });
}
