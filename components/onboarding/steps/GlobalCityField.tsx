import { type GlobalLocalitySuggestion } from "@/lib/location/global-locality-shared";
import { searchGlobalLocalities } from "@/lib/location/search-global-localities";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  countryCode: string;
  countryName: string;
  value: string;
  region?: string | null;
  selectedGeonameId?: number | null;
  dark: boolean;
  styles: any;
  error?: string;
  required?: boolean;
  onSelect: (place: GlobalLocalitySuggestion | null) => void;
  onRegionChange?: (region: string) => void;
};

export function GlobalCityField({
  countryCode,
  countryName,
  value,
  region,
  selectedGeonameId,
  dark,
  styles,
  error: fieldError,
  required = false,
  onSelect,
  onRegionChange,
}: Props) {
  const requestRef = useRef(0);
  const previousCountryRef = useRef(countryCode);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalLocalitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canUseRegionOnly = required && Boolean(onRegionChange);
  const [regionOnly, setRegionOnly] = useState(Boolean(canUseRegionOnly && !value && region));

  useEffect(() => {
    const normalized = query.replace(/\s+/g, " ").trim();
    if (!visible || normalized.length < 2 || countryCode.length !== 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const next = await searchGlobalLocalities({
          countryCode,
          query: normalized,
          limit: 24,
        });
        if (requestRef.current === requestId) setResults(next);
      } catch {
        if (requestRef.current === requestId) {
          setError("We couldn't load places. Check your connection and try again.");
        }
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 380);

    return () => clearTimeout(timer);
  }, [countryCode, query, visible]);

  useEffect(() => {
    if (previousCountryRef.current !== countryCode) {
      previousCountryRef.current = countryCode;
      setRegionOnly(false);
    }
  }, [countryCode]);

  const close = () => {
    setVisible(false);
    setQuery("");
    setResults([]);
    setError("");
  };

  return (
    <View style={styles.citySection}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>
          {regionOnly ? "Current region or state" : "Current city or town"}
        </Text>
        <Text style={styles.optionalLabel}>{required ? "Required" : "Optional"}</Text>
      </View>

      {regionOnly ? (
        <TextInput
          value={region ?? ""}
          onChangeText={(nextRegion) => onRegionChange?.(nextRegion)}
          placeholder={`Region or state in ${countryName}`}
          placeholderTextColor={styles.tokens.muted.color}
          style={[styles.input, fieldError && styles.inputError]}
          autoCapitalize="words"
          accessibilityLabel={`Current region or state in ${countryName}`}
        />
      ) : (
        <Pressable
          style={[
            styles.selectBox,
            value && styles.selectBoxSelected,
            fieldError && styles.inputError,
          ]}
          onPress={() => setVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={
            value
              ? `Current city, ${value}, ${region || countryName}`
              : `Choose a city in ${countryName}`
          }
        >
          <View style={styles.selectValueWrap}>
            <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>
              {value || `Choose a city in ${countryName}`}
            </Text>
            {value && region ? <Text style={styles.selectMetaText}>{region}</Text> : null}
          </View>
          {value ? (
            <Pressable
              hitSlop={8}
              accessibilityLabel="Clear current city"
              onPress={(event) => {
                event.stopPropagation();
                onSelect(null);
              }}
            >
              <MaterialCommunityIcons
                name="close-circle-outline"
                size={18}
                color={styles.tokens.muted.color}
              />
            </Pressable>
          ) : null}
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={styles.tokens.accent.color}
          />
        </Pressable>
      )}

      <Text style={styles.helperText}>
        {regionOnly
          ? "Your region supports broader discovery without sharing an exact city."
          : "Selecting a city fills its correct region automatically."}
      </Text>
      {canUseRegionOnly ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (regionOnly) onRegionChange?.("");
            else onSelect(null);
            setRegionOnly((current) => !current);
          }}
        >
          <Text style={[styles.subtleNote, { color: styles.tokens.accent.color }]}>
            {regionOnly
              ? "Choose a city or town instead"
              : "My city is not listed - use region/state only"}
          </Text>
        </Pressable>
      ) : null}
      {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}

      <Modal
        visible={visible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet} edges={["top"]}>
            <View style={styles.modalSheetInner}>
              <View style={styles.modalHeader}>
                <Pressable
                  style={styles.modalClose}
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Close city or town picker"
                >
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
                <Text style={styles.modalBodyLead}>Where are you based in {countryName}?</Text>
                <Text style={styles.modalBodySupport}>
                  Choose the city or town you currently call home.
                </Text>
              </View>

              <View style={styles.searchBox}>
                <MaterialCommunityIcons
                  name="magnify"
                  size={20}
                  color={styles.tokens.muted.color}
                />
                <TextInput
                  autoFocus
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search cities in ${countryName}`}
                  placeholderTextColor={styles.tokens.muted.color}
                  style={styles.searchInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel={`Search for a city or town in ${countryName}`}
                />
                {loading ? (
                  <ActivityIndicator size="small" color={styles.tokens.accent.color} />
                ) : null}
              </View>

              {query.trim().length < 2 ? (
                <Text style={[styles.modalBodySupport, styles.globalCityGuidance]}>
                  Type at least two letters. Results stay within {countryName}.
                </Text>
              ) : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <FlatList
                data={results}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                keyExtractor={(item) => String(item.geonameId)}
                contentContainerStyle={styles.cityPickerListContent}
                ListHeaderComponent={
                  results.length ? (
                    <Text style={styles.cityPickerSectionTitle}>Search results</Text>
                  ) : null
                }
                ListEmptyComponent={
                  !loading && query.trim().length >= 2 && !error ? (
                    <View style={styles.modalEmptyState}>
                      <Text style={styles.modalEmptyTitle}>No city or town matched</Text>
                      <Text style={styles.modalEmptyBody}>
                        Try a broader spelling or a nearby town.
                      </Text>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => {
                  const selected = selectedGeonameId === item.geonameId;
                  const placeLabel = [item.admin1Name, item.countryName]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        selected
                          ? `${item.name}, ${placeLabel}, selected`
                          : `${item.name}, ${placeLabel}`
                      }
                      style={[
                        styles.cityPickerRow,
                        selected && styles.cityPickerRowSelected,
                      ]}
                      onPress={() => {
                        onSelect(item);
                        close();
                      }}
                    >
                      <View style={styles.modalListTextWrap}>
                        <Text style={styles.cityPickerRowTitle}>{item.name}</Text>
                        <Text style={styles.modalListMeta}>{placeLabel}</Text>
                      </View>
                      <MaterialCommunityIcons
                        name={selected ? "check" : "chevron-right"}
                        size={20}
                        color={
                          selected
                            ? styles.tokens.accent.color
                            : styles.tokens.muted.color
                        }
                      />
                    </Pressable>
                  );
                }}
              />
              <Text style={[styles.modalListMeta, styles.globalCityAttribution]}>
                Place data © GeoNames contributors
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
