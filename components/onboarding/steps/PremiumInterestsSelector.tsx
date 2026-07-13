import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type Props = {
  interests: readonly string[];
  selected: string[];
  styles: any;
  onToggle: (interest: string) => void;
};

const MAX_INTERESTS = 5;
const POPULAR_COUNT = 12;

function getInterestIcon(interest: string): string {
  const value = interest.toLowerCase();
  if (value.includes("music")) return "music-note-outline";
  if (value === "travel") return "airplane";
  if (value === "fitness" || value === "wellness") return "dumbbell";
  if (value === "food" || value === "cooking") return "silverware-fork-knife";
  if (value === "culture" || value === "theatre") return "theater";
  if (value === "books") return "book-open-page-variant-outline";
  if (value === "art") return "palette-outline";
  if (value === "nature" || value === "hiking") return "pine-tree";
  if (value === "film") return "movie-open-outline";
  if (value === "sport" || value === "football") return "soccer";
  if (value === "faith") return "shimmer";
  if (value === "family") return "account-group-outline";
  if (value === "business" || value === "entrepreneurship") return "briefcase-outline";
  if (value === "dancing") return "dance-ballroom";
  if (value === "photography") return "camera-outline";
  if (value === "fashion") return "hanger";
  if (value === "gaming") return "controller-classic-outline";
  if (value === "technology") return "laptop";
  if (value === "volunteering") return "hand-heart-outline";
  if (value === "podcasts") return "microphone-outline";
  if (value === "nightlife") return "glass-cocktail";
  return "star-four-points-outline";
}

export function PremiumInterestsSelector({ interests, selected, styles, onToggle }: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const atLimit = selected.length >= MAX_INTERESTS;
  const visibleInterests = useMemo(() => {
    if (!normalizedQuery) return interests.slice(0, POPULAR_COUNT);
    return interests.filter((interest) => interest.toLowerCase().includes(normalizedQuery));
  }, [interests, normalizedQuery]);

  return (
    <View>
      <View style={styles.interestsMixHeader}>
        <View>
          <Text style={styles.interestsMixEyebrow}>YOUR MIX</Text>
          <Text style={styles.interestsMixCount}>{selected.length} of {MAX_INTERESTS} selected</Text>
        </View>
        <View style={styles.interestsProgressDots}>
          {Array.from({ length: MAX_INTERESTS }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.interestsProgressDot,
                index < selected.length && styles.interestsProgressDotFilled,
                index === 2 && index < selected.length && styles.interestsProgressDotTeal,
                index >= 3 && index < selected.length && styles.interestsProgressDotPurple,
              ]}
            />
          ))}
        </View>
      </View>

      {selected.length ? (
        <View style={styles.interestsSelectedWrap}>
          {selected.map((interest) => (
            <Pressable key={interest} style={styles.interestsSelectedPill} onPress={() => onToggle(interest)}>
              <MaterialCommunityIcons name={getInterestIcon(interest) as any} size={14} color={styles.tokens.accent.color} />
              <Text style={styles.interestsSelectedText}>{interest}</Text>
              <MaterialCommunityIcons name="close" size={13} color={styles.tokens.muted.color} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.interestsMixHint}>Choose at least 3 things that feel like you.</Text>
      )}

      <View style={styles.interestsSearch}>
        <MaterialCommunityIcons name="magnify" size={20} color={styles.tokens.muted.color} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find an interest"
          placeholderTextColor={styles.tokens.muted.color}
          style={styles.interestsSearchInput}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear interest search">
            <MaterialCommunityIcons name="close-circle" size={18} color={styles.tokens.muted.color} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.interestsDirectoryHeader}>
        <Text style={styles.interestsDirectoryLabel}>{normalizedQuery ? "MATCHING INTERESTS" : "POPULAR NOW"}</Text>
        {atLimit ? (
          <View style={styles.interestsReadyPill}>
            <MaterialCommunityIcons name="check" size={12} color={styles.tokens.accent.color} />
            <Text style={styles.interestsReadyText}>Your mix is ready</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.interestsGrid}>
        {visibleInterests.map((interest) => {
          const isSelected = selected.includes(interest);
          const disabled = atLimit && !isSelected;
          return (
            <Pressable
              key={interest}
              style={[
                styles.interestTile,
                isSelected && styles.interestTileSelected,
                disabled && styles.interestTileDisabled,
              ]}
              onPress={() => onToggle(interest)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled }}
            >
              <View style={[styles.interestTileIcon, isSelected && styles.interestTileIconSelected]}>
                <MaterialCommunityIcons
                  name={getInterestIcon(interest) as any}
                  size={19}
                  color={isSelected ? styles.tokens.accent.color : styles.tokens.muted.color}
                />
              </View>
              <Text style={[styles.interestTileText, isSelected && styles.interestTileTextSelected]}>{interest}</Text>
              <MaterialCommunityIcons
                name={isSelected ? "check-circle" : "plus-circle-outline"}
                size={17}
                color={isSelected ? styles.tokens.accent.color : styles.tokens.muted.color}
              />
            </Pressable>
          );
        })}
      </View>

      {!visibleInterests.length ? (
        <View style={styles.interestsEmpty}>
          <MaterialCommunityIcons name="magnify-close" size={23} color={styles.tokens.muted.color} />
          <Text style={styles.interestsEmptyText}>No match yet. Try a broader search.</Text>
        </View>
      ) : null}
    </View>
  );
}
