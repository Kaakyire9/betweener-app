import { type GlobalLocalitySuggestion } from "@/lib/location/global-locality-shared";
import { searchGlobalLocalities } from "@/lib/location/search-global-localities";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

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
  modalMode?: "overlay" | "screen";
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
  modalMode = "overlay",
  onSelect,
  onRegionChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const requestRef = useRef(0);
  const previousCountryRef = useRef(countryCode);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalLocalitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canUseRegionOnly = required && Boolean(onRegionChange);
  const [regionOnly, setRegionOnly] = useState(Boolean(canUseRegionOnly && !value && region));
  const accentColor = styles.tokens.accent.color;
  const mutedColor = styles.tokens.muted.color;
  const screenTopInset = Math.max(
    insets.top,
    initialWindowMetrics?.insets.top ?? 0,
    Platform.OS === "ios" ? 54 : (StatusBar.currentHeight ?? 0),
  );
  const pickerStyles = useMemo(
    () => StyleSheet.create({
      backdrop: {
        flex: 1,
        backgroundColor: dark ? "rgba(2,8,10,0.58)" : "rgba(7,30,34,0.18)",
        justifyContent: "flex-end",
      },
      screenBackdrop: { backgroundColor: dark ? "#071719" : "#FFF9F1" },
      sheet: { flex: 1, justifyContent: "flex-end" },
      inner: {
        flex: 1,
        paddingTop: modalMode === "screen" ? screenTopInset : 0,
        borderTopLeftRadius: modalMode === "screen" ? 0 : 28,
        borderTopRightRadius: modalMode === "screen" ? 0 : 28,
        backgroundColor: dark ? "#071719" : "#FFF9F1",
        overflow: "hidden",
      },
      header: {
        minHeight: 56,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: dark ? "rgba(244,235,221,0.12)" : "rgba(7,30,34,0.10)",
      },
      close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
      title: {
        color: dark ? "#F4EBDD" : "#071E22",
        fontFamily: "Manrope_700Bold",
        fontSize: 16,
      },
      intro: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
      lead: {
        color: dark ? "#F4EBDD" : "#071E22",
        fontFamily: "PlayfairDisplay_700Bold",
        fontSize: 22,
        lineHeight: 29,
      },
      support: {
        marginTop: 6,
        color: mutedColor,
        fontFamily: "Manrope_600SemiBold",
        fontSize: 13,
        lineHeight: 19,
      },
      search: {
        marginHorizontal: 20,
        marginTop: 18,
        marginBottom: 12,
        minHeight: 56,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: dark ? "rgba(244,235,221,0.16)" : "rgba(7,30,34,0.14)",
        backgroundColor: dark ? "rgba(244,235,221,0.06)" : "rgba(255,255,255,0.82)",
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      },
      searchInput: {
        flex: 1,
        color: dark ? "#F4EBDD" : "#071E22",
        fontFamily: "Manrope_600SemiBold",
        fontSize: 15,
      },
      guidance: { paddingHorizontal: 20, paddingBottom: 10 },
      error: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        color: "#D85A5A",
        fontFamily: "Manrope_600SemiBold",
        fontSize: 13,
      },
      list: { paddingHorizontal: 20, paddingBottom: 32 },
      sectionTitle: {
        marginTop: 8,
        marginBottom: 8,
        color: mutedColor,
        fontFamily: "Manrope_700Bold",
        fontSize: 11,
        letterSpacing: 1.1,
        textTransform: "uppercase",
      },
      row: {
        minHeight: 60,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: dark ? "rgba(244,235,221,0.10)" : "rgba(7,30,34,0.09)",
      },
      rowSelected: {
        marginVertical: 3,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderBottomColor: "transparent",
        backgroundColor: dark ? "rgba(19,168,168,0.12)" : "rgba(19,168,168,0.09)",
      },
      rowCopy: { flex: 1 },
      rowTitle: {
        color: dark ? "#F4EBDD" : "#071E22",
        fontFamily: "Manrope_700Bold",
        fontSize: 15,
      },
      rowMeta: {
        marginTop: 3,
        color: mutedColor,
        fontFamily: "Manrope_500Medium",
        fontSize: 12.5,
      },
      empty: { paddingVertical: 42, alignItems: "center", paddingHorizontal: 24 },
      emptyTitle: {
        color: dark ? "#F4EBDD" : "#071E22",
        fontFamily: "Manrope_700Bold",
        fontSize: 15,
        textAlign: "center",
      },
      emptyBody: {
        marginTop: 7,
        color: mutedColor,
        fontFamily: "Manrope_500Medium",
        fontSize: 13,
        lineHeight: 19,
        textAlign: "center",
      },
      attribution: {
        color: mutedColor,
        fontFamily: "Manrope_500Medium",
        fontSize: 11,
        textAlign: "center",
        paddingVertical: 10,
      },
    }),
    [dark, modalMode, mutedColor, screenTopInset],
  );

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
        animationType={modalMode === "screen" ? "slide" : "fade"}
        transparent={modalMode !== "screen"}
        statusBarTranslucent={modalMode !== "screen"}
        presentationStyle={modalMode === "screen" ? "fullScreen" : "overFullScreen"}
        onRequestClose={close}
      >
        <View style={[pickerStyles.backdrop, modalMode === "screen" && pickerStyles.screenBackdrop]}>
          <SafeAreaView
            style={pickerStyles.sheet}
            edges={modalMode === "screen" ? ["bottom"] : ["top", "bottom"]}
          >
            <View style={pickerStyles.inner}>
              <View style={pickerStyles.header}>
                <Pressable
                  style={pickerStyles.close}
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
                <Text style={pickerStyles.title}>City or town</Text>
                <View style={pickerStyles.close} />
              </View>

              <View style={pickerStyles.intro}>
                <Text style={pickerStyles.lead}>Where are you based in {countryName}?</Text>
                <Text style={pickerStyles.support}>
                  Choose the city or town you currently call home.
                </Text>
              </View>

              <View style={pickerStyles.search}>
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
                  style={pickerStyles.searchInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel={`Search for a city or town in ${countryName}`}
                />
                {loading ? (
                  <ActivityIndicator size="small" color={accentColor} />
                ) : null}
              </View>

              {query.trim().length < 2 ? (
                <Text style={[pickerStyles.support, pickerStyles.guidance]}>
                  Type at least two letters. Results stay within {countryName}.
                </Text>
              ) : null}
              {error ? <Text style={pickerStyles.error}>{error}</Text> : null}

              <FlatList
                data={results}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                keyExtractor={(item) => String(item.geonameId)}
                contentContainerStyle={pickerStyles.list}
                ListHeaderComponent={
                  results.length ? (
                    <Text style={pickerStyles.sectionTitle}>Search results</Text>
                  ) : null
                }
                ListEmptyComponent={
                  !loading && query.trim().length >= 2 && !error ? (
                    <View style={pickerStyles.empty}>
                      <Text style={pickerStyles.emptyTitle}>No city or town matched</Text>
                      <Text style={pickerStyles.emptyBody}>
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
                        pickerStyles.row,
                        selected && pickerStyles.rowSelected,
                      ]}
                      onPress={() => {
                        onSelect(item);
                        close();
                      }}
                    >
                      <View style={pickerStyles.rowCopy}>
                        <Text style={pickerStyles.rowTitle}>{item.name}</Text>
                        <Text style={pickerStyles.rowMeta}>{placeLabel}</Text>
                      </View>
                      <MaterialCommunityIcons
                        name={selected ? "check" : "chevron-right"}
                        size={20}
                        color={
                          selected ? accentColor : mutedColor
                        }
                      />
                    </Pressable>
                  );
                }}
              />
              <Text style={pickerStyles.attribution}>
                Place data © GeoNames contributors
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
