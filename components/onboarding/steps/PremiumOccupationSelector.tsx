import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type Props = {
  occupations: readonly string[];
  selectedOccupation: string;
  customOccupation: string;
  error?: string;
  styles: any;
  onSelect: (occupation: string) => void;
  onSelectCustom: (occupation: string) => void;
};

const POPULAR_COUNT = 8;

function getOccupationIcon(occupation: string): string {
  const value = occupation.toLowerCase();
  if (value.includes("student")) return "school-outline";
  if (value.includes("doctor") || value.includes("nurse") || value.includes("dentist") || value.includes("pharmac")) return "medical-bag";
  if (value.includes("engineer") || value.includes("data") || value.includes("software")) return "laptop";
  if (value.includes("teacher") || value.includes("lecturer")) return "book-education-outline";
  if (value.includes("business") || value.includes("entrepreneur")) return "briefcase-outline";
  if (value.includes("bank") || value.includes("account")) return "finance";
  if (value.includes("design") || value.includes("fashion")) return "palette-outline";
  if (value.includes("government") || value.includes("public service")) return "bank-outline";
  if (value.includes("lawyer")) return "scale-balance";
  if (value.includes("hospitality")) return "silverware-fork-knife";
  if (value.includes("farmer") || value.includes("agri")) return "sprout-outline";
  if (value.includes("photographer") || value.includes("creator")) return "camera-outline";
  if (value.includes("trade") || value.includes("electrician")) return "tools";
  if (value.includes("retired")) return "weather-sunset";
  if (value.includes("between") || value.includes("prefer")) return "account-outline";
  return "briefcase-variant-outline";
}

export function PremiumOccupationSelector({
  occupations,
  selectedOccupation,
  customOccupation,
  error,
  styles,
  onSelect,
  onSelectCustom,
}: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const selectedLabel = selectedOccupation === "Other" ? customOccupation : selectedOccupation;
  const matches = useMemo(() => {
    if (!normalizedQuery) return occupations.slice(0, POPULAR_COUNT);
    return occupations.filter((occupation) => occupation.toLowerCase().includes(normalizedQuery)).slice(0, 10);
  }, [normalizedQuery, occupations]);
  const canUseCustom = query.trim().length >= 2 && !occupations.some((item) => item.toLowerCase() === normalizedQuery);

  return (
    <View>
      {selectedLabel ? (
        <View style={styles.occupationSelectedCard}>
          <View style={styles.occupationSelectedLead}>
            <View style={styles.occupationSelectedIcon}>
              <MaterialCommunityIcons
                name={getOccupationIcon(selectedLabel) as any}
                size={21}
                color={styles.tokens.accent.color}
              />
            </View>
            <View style={styles.occupationSelectedCopy}>
              <Text style={styles.occupationSelectedEyebrow}>YOUR WORK</Text>
              <Text style={styles.occupationSelectedTitle}>{selectedLabel}</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="check-decagram" size={22} color={styles.tokens.accent.color} />
        </View>
      ) : null}

      <View style={[styles.occupationSearch, error && styles.inputError]}>
        <MaterialCommunityIcons name="magnify" size={21} color={styles.tokens.muted.color} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search or describe what you do"
          placeholderTextColor={styles.tokens.muted.color}
          style={styles.occupationSearchInput}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (canUseCustom) onSelectCustom(query.trim());
          }}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear occupation search">
            <MaterialCommunityIcons name="close-circle" size={19} color={styles.tokens.muted.color} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.occupationSectionLabel}>{normalizedQuery ? "MATCHING ROLES" : "POPULAR"}</Text>
      <View style={styles.occupationGrid}>
        {matches.map((occupation) => {
          const selected = selectedOccupation === occupation;
          return (
            <Pressable
              key={occupation}
              style={[styles.occupationCard, selected && styles.occupationCardSelected]}
              onPress={() => {
                onSelect(occupation);
                setQuery("");
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[styles.occupationCardIcon, selected && styles.occupationCardIconSelected]}>
                <MaterialCommunityIcons
                  name={getOccupationIcon(occupation) as any}
                  size={18}
                  color={selected ? styles.tokens.accent.color : styles.tokens.muted.color}
                />
              </View>
              <Text style={[styles.occupationCardText, selected && styles.occupationCardTextSelected]} numberOfLines={2}>
                {occupation}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {canUseCustom ? (
        <Pressable
          style={styles.occupationCustomAction}
          onPress={() => {
            onSelectCustom(query.trim());
            setQuery("");
          }}
        >
          <View style={styles.occupationCustomIcon}>
            <MaterialCommunityIcons name="plus" size={18} color={styles.tokens.accent.color} />
          </View>
          <View style={styles.occupationSelectedCopy}>
            <Text style={styles.occupationCustomLabel}>USE YOUR OWN TITLE</Text>
            <Text style={styles.occupationCustomValue}>{query.trim()}</Text>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={19} color={styles.tokens.accent.color} />
        </Pressable>
      ) : null}

      {!matches.length && !canUseCustom ? (
        <Text style={styles.occupationEmpty}>Try a broader role or enter your own title.</Text>
      ) : null}
    </View>
  );
}
