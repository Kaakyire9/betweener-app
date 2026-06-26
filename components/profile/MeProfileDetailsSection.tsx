import { Colors } from "@/constants/theme";
import { formatProfileDetailValue } from "@/lib/profile/me-screen-helpers";
import { formatReligionLabel } from "@/lib/profile/religion";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Theme = typeof Colors.light;

type Props = {
  theme: Theme;
  profile: Record<string, any> | null | undefined;
  locationWithFlag: string | null | undefined;
};

export default function MeProfileDetailsSection({
  theme,
  profile,
  locationWithFlag,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!profile) {
    return null;
  }

  const hasAge = typeof profile.age === "number" && profile.age > 0;
  const hasHeight = Boolean(profile.height);
  const hasKids = Boolean(profile.kids);
  const hasFamilyPlans = Boolean(profile.family_plans);
  const hasReligion = Boolean(profile.religion);
  const hasTribe = Boolean(profile.tribe);
  const hasOccupation = Boolean(profile.occupation);
  const hasEducation = Boolean(profile.education);
  const hasLookingFor = Boolean(profile.looking_for);
  const hasLocation = Boolean(locationWithFlag);
  const hasYearsInDiaspora =
    typeof profile.years_in_diaspora === "number" && profile.years_in_diaspora > 0;
  const hasFutureGhanaPlans = Boolean(profile.future_ghana_plans);
  const hasExerciseFrequency = Boolean(profile.exercise_frequency);
  const hasSmoking = Boolean(profile.smoking);
  const hasDrinking = Boolean(profile.drinking);
  const hasChildren = Boolean(profile.has_children);
  const wantsChildren = Boolean(profile.wants_children);
  const hasPersonalityType = Boolean(profile.personality_type);
  const hasLoveLanguage = Boolean(profile.love_language);
  const hasLivingSituation = Boolean(profile.living_situation);
  const hasPets = Boolean(profile.pets);
  const hasLanguages =
    Array.isArray(profile.languages_spoken) && profile.languages_spoken.length > 0;

  const hasAnyDetails =
    hasAge ||
    hasHeight ||
    hasKids ||
    hasFamilyPlans ||
    hasReligion ||
    hasTribe ||
    hasOccupation ||
    hasEducation ||
    hasLookingFor ||
    hasLocation ||
    hasYearsInDiaspora ||
    hasFutureGhanaPlans ||
    hasExerciseFrequency ||
    hasSmoking ||
    hasDrinking ||
    hasChildren ||
    wantsChildren ||
    hasPersonalityType ||
    hasLoveLanguage ||
    hasLivingSituation ||
    hasPets ||
    hasLanguages;

  if (!hasAnyDetails) {
    return null;
  }

  return (
    <View style={styles.profileDetails}>
      {hasAge || hasHeight ? (
        <View style={styles.detailRow}>
          {hasAge ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="cake-variant" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`${profile.age} years old`}
              </Text>
            </View>
          ) : null}
          {hasHeight ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons
                name="human-male-height"
                size={16}
                color={theme.tint}
              />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`Height: ${profile.height}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasKids ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="baby-face-outline" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`Kids: ${profile.kids}`}
            </Text>
          </View>
        </View>
      ) : null}

      {hasFamilyPlans ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="home-heart" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`Family Plans: ${profile.family_plans}`}
            </Text>
          </View>
        </View>
      ) : null}

      {hasReligion || hasTribe ? (
        <View style={styles.detailRow}>
          {hasReligion ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="shield-check" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`Faith: ${formatReligionLabel(profile.religion)}`}
              </Text>
            </View>
          ) : null}
          {hasTribe ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="star-four-points" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`Heritage: ${profile.tribe}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasOccupation ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="briefcase" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {profile.occupation}
            </Text>
          </View>
        </View>
      ) : null}

      {hasEducation ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="school" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {profile.education}
            </Text>
          </View>
        </View>
      ) : null}

      {hasLookingFor ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="heart-outline" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`Looking for ${formatProfileDetailValue(profile.looking_for)}`}
            </Text>
          </View>
        </View>
      ) : null}

      {hasLocation ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="map-marker" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`Currently in ${locationWithFlag}`}
            </Text>
          </View>
        </View>
      ) : null}

      {hasYearsInDiaspora ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="calendar" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`${profile.years_in_diaspora} years abroad`}
            </Text>
          </View>
        </View>
      ) : null}

      {hasFutureGhanaPlans ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="compass" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {profile.future_ghana_plans}
            </Text>
          </View>
        </View>
      ) : null}

      {hasExerciseFrequency ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="dumbbell" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`Exercise: ${formatProfileDetailValue(profile.exercise_frequency)}`}
            </Text>
          </View>
        </View>
      ) : null}

      {hasSmoking || hasDrinking ? (
        <View style={styles.detailRow}>
          {hasSmoking ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="smoking-off" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`Smoking: ${formatProfileDetailValue(profile.smoking)}`}
              </Text>
            </View>
          ) : null}
          {hasDrinking ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="glass-cocktail" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`Drinking: ${formatProfileDetailValue(profile.drinking)}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasChildren || wantsChildren ? (
        <View style={styles.detailRow}>
          {hasChildren ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="baby" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`Children: ${profile.has_children}`}
              </Text>
            </View>
          ) : null}
          {wantsChildren ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="heart-plus" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {`Wants: ${profile.wants_children}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasPersonalityType ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="account-circle" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {profile.personality_type}
            </Text>
          </View>
        </View>
      ) : null}

      {hasLoveLanguage ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="heart-multiple" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`Love Language: ${profile.love_language}`}
            </Text>
          </View>
        </View>
      ) : null}

      {hasLivingSituation || hasPets ? (
        <View style={styles.detailRow}>
          {hasLivingSituation ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="home" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {profile.living_situation}
              </Text>
            </View>
          ) : null}
          {hasPets ? (
            <View
              style={[
                styles.detailItem,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <MaterialCommunityIcons name="paw" size={16} color={theme.tint} />
              <Text style={[styles.detailText, { color: theme.text }]}>
                {profile.pets}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasLanguages ? (
        <View style={styles.detailRow}>
          <View
            style={[
              styles.detailItem,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <MaterialCommunityIcons name="translate" size={16} color={theme.tint} />
            <Text style={[styles.detailText, { color: theme.text }]}>
              {`Languages: ${profile.languages_spoken.join(", ")}`}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    profileDetails: {
      marginTop: 16,
      gap: 8,
      width: "100%",
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      justifyContent: "center",
      marginBottom: 2,
    },
    detailItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "transparent",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#e2e8f0",
      flexBasis: "48%",
      flexGrow: 1,
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    detailText: {
      fontSize: 13.5,
      color: "#475569",
      fontFamily: "Manrope_500Medium",
    },
  });
}
