import type { GhanaCityTownSuggestion } from "@/lib/location/ghana-locality-shared";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useEffect, useMemo, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type PickerRow =
  | { type: "section"; id: string; title: string }
  | { type: "skeleton"; id: string }
  | { type: "locality"; id: string; item: GhanaCityTownSuggestion }
  | { type: "action"; id: string; label: string; body: string }
  | { type: "empty"; id: string; title: string; body: string };

type Props = {
  visible: boolean;
  dark: boolean;
  region: string;
  search: string;
  searchExamples: string[];
  suggested: GhanaCityTownSuggestion[];
  recent: GhanaCityTownSuggestion[];
  preview: GhanaCityTownSuggestion[];
  results: GhanaCityTownSuggestion[];
  loading?: boolean;
  initializing?: boolean;
  selectedLocalityGeonameId?: number | null;
  selectedName?: string;
  styles: any;
  reduceMotion?: boolean;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (selection: GhanaCityTownSuggestion) => void;
  onClear: () => void;
};

const buildLocalityRowId = (item: GhanaCityTownSuggestion) =>
  item.geonameId != null
    ? `locality:${item.geonameId}`
    : `locality:${item.region}:${item.name}:${item.district || "none"}`;

export function GhanaCityTownPickerModal({
  visible,
  dark,
  region,
  search,
  searchExamples,
  suggested,
  recent,
  preview,
  results,
  loading,
  initializing = false,
  selectedLocalityGeonameId,
  selectedName,
  styles,
  reduceMotion = false,
  onClose,
  onSearchChange,
  onSelect,
  onClear,
}: Props) {
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const entranceTranslate = useRef(new Animated.Value(8)).current;
  const normalizedQuery = search.trim();
  const hasQuery = normalizedQuery.length >= 2;
  const searchPlaceholder = searchExamples.length
    ? `Search ${searchExamples.join(", ")}...`
    : "Search city or town";

  useEffect(() => {
    if (!visible) {
      entranceOpacity.setValue(0);
      entranceTranslate.setValue(8);
      return;
    }

    Animated.parallel([
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: reduceMotion ? 0 : 200,
        useNativeDriver: true,
      }),
      Animated.timing(entranceTranslate, {
        toValue: 0,
        duration: reduceMotion ? 0 : 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entranceOpacity, entranceTranslate, reduceMotion, visible]);

  const rows = useMemo<PickerRow[]>(() => {
    if (!visible) return [];

    const next: PickerRow[] = [];
    const seenLocalityIds = new Set<string>();
    const pushLocality = (item: GhanaCityTownSuggestion) => {
      const id = buildLocalityRowId(item);
      if (seenLocalityIds.has(id)) return;
      seenLocalityIds.add(id);
      next.push({ type: "locality", id, item });
    };

    if (initializing && !hasQuery) {
      next.push({ type: "section", id: "section:loading", title: "Loading places" });
      next.push({ type: "skeleton", id: "skeleton:1" });
      next.push({ type: "skeleton", id: "skeleton:2" });
      next.push({ type: "skeleton", id: "skeleton:3" });
      return next;
    }

    if (!hasQuery) {
      if (recent.length > 0) {
        next.push({ type: "section", id: "section:recent", title: "Recent" });
        recent.forEach((item) => {
          pushLocality(item);
        });
      }

      if (suggested.length > 0) {
        next.push({
          type: "section",
          id: "section:suggested",
          title: `Suggested in ${region}`,
        });
        suggested.forEach((item) => {
          pushLocality(item);
        });
      }

      if (preview.length > 0) {
        next.push({ type: "section", id: "section:preview", title: "All places" });
        preview.forEach((item) => {
          pushLocality(item);
        });
      }

      if (next.length === 0) {
        next.push({
          type: "empty",
          id: "empty:initial",
          title: "Places are taking a moment to load",
          body: "Try a search in a second, or use a nearby town you recognise.",
        });
      }
    } else if (results.length > 0) {
      next.push({ type: "section", id: "section:results", title: "Search results" });
      results.forEach((item) => {
        pushLocality(item);
      });
    } else if (!loading) {
      next.push({
        type: "empty",
        id: "empty:results",
        title: "No town matched that search",
        body: "Try a broader spelling or a nearby town.",
      });
    }

    return next;
  }, [hasQuery, initializing, loading, preview, recent, region, results, suggested, visible]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.modalSheet} edges={["top"]}>
          <Animated.View
            style={[
              styles.modalSheetInner,
              {
                opacity: entranceOpacity,
                transform: [{ translateY: entranceTranslate }],
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Pressable style={styles.modalClose} onPress={onClose}>
                <MaterialCommunityIcons
                  name="arrow-left"
                  size={22}
                  color={dark ? "#F4EBDD" : "#071E22"}
                />
              </Pressable>
              <Text style={styles.modalTitle}>City or town</Text>
              <View style={styles.modalClose} />
            </View>

            <View style={styles.modalBodyIntro}>
              <Text style={styles.modalBodyLead}>Where are you based in {region}?</Text>
              <Text style={styles.modalBodySupport}>Choose the city or town you currently call home.</Text>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={styles.tokens.muted.color} />
              <TextInput
                value={search}
                onChangeText={onSearchChange}
                placeholder={searchPlaceholder}
                placeholderTextColor={styles.tokens.muted.color}
                style={styles.searchInput}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                accessibilityLabel="Search for a Ghana city or town in the selected region"
              />
              {loading ? (
                <MaterialCommunityIcons name="loading" size={18} color={styles.tokens.accent.color} />
              ) : null}
            </View>

            <FlashList
              data={rows}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.cityPickerListContent}
              renderItem={({ item }) => {
                if (item.type === "section") {
                  return <Text style={styles.cityPickerSectionTitle}>{item.title}</Text>;
                }

                if (item.type === "skeleton") {
                  return (
                    <View style={styles.cityPickerSkeletonRow}>
                      <View style={styles.cityPickerSkeletonTextWrap}>
                        <View style={styles.cityPickerSkeletonTitle} />
                        <View style={styles.cityPickerSkeletonMeta} />
                      </View>
                      <View style={styles.cityPickerSkeletonChevron} />
                    </View>
                  );
                }

                if (item.type === "empty") {
                  return (
                    <View style={styles.modalEmptyState}>
                      <Text style={styles.modalEmptyTitle}>{item.title}</Text>
                      <Text style={styles.modalEmptyBody}>{item.body}</Text>
                    </View>
                  );
                }

                if (item.type === "action") {
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.label}. ${item.body}`}
                      style={styles.cityPickerQuietAction}
                      onPress={onClear}
                    >
                      <View style={styles.modalListTextWrap}>
                        <Text style={styles.cityPickerQuietActionText}>{item.label}</Text>
                        <Text style={styles.modalListMeta}>{item.body}</Text>
                      </View>
                      {!selectedName ? (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={20}
                          color={styles.tokens.accent.color}
                        />
                      ) : null}
                    </Pressable>
                  );
                }

                const selected =
                  (selectedLocalityGeonameId != null &&
                    item.item.geonameId != null &&
                    selectedLocalityGeonameId === item.item.geonameId) ||
                  (!selectedLocalityGeonameId &&
                    selectedName?.toLowerCase() === item.item.name.toLowerCase());

                const accessibilityLabel = item.item.district
                  ? `${item.item.name}, ${item.item.district}`
                  : item.item.name;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={selected ? `${accessibilityLabel}, selected` : accessibilityLabel}
                    style={[
                      styles.cityPickerRow,
                      selected && styles.cityPickerRowSelected,
                    ]}
                    onPress={() => onSelect(item.item)}
                  >
                    <View style={styles.modalListTextWrap}>
                      <Text style={styles.cityPickerRowTitle}>{item.item.name}</Text>
                      <Text style={styles.modalListMeta}>
                        {item.item.district || region}
                      </Text>
                    </View>
                    {selected ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={20}
                        color={styles.tokens.accent.color}
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={styles.tokens.muted.color}
                      />
                    )}
                  </Pressable>
                );
              }}
            />
          </Animated.View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
