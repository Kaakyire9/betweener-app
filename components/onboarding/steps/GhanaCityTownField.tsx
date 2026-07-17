import { GhanaCityTownPickerModal } from "@/components/onboarding/steps/GhanaCityTownPickerModal";
import {
  getRegionSearchExamples,
  getSuggestedLocalities,
  readRecentGhanaLocalities,
  saveRecentGhanaLocality,
} from "@/lib/location/location-intelligence";
import {
  normalizeGhanaCityTownValue,
  type GhanaCityTownSuggestion,
} from "@/lib/location/ghana-locality-shared";
import { searchGhanaLocalities } from "@/lib/location/search-ghana-localities";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
  Pressable,
  Text,
  View,
} from "react-native";

type Props = {
  region: string;
  value: string;
  selectedDistrict?: string | null;
  selectedLocalityGeonameId?: number | null;
  dark: boolean;
  styles: any;
  error?: string;
  onSelectLocality: (selection: GhanaCityTownSuggestion | null) => void;
  onAnalyticsEvent?: (event: string, payload?: Record<string, unknown>) => void;
};

export function GhanaCityTownField({
  region,
  value,
  selectedDistrict,
  selectedLocalityGeonameId,
  dark,
  styles,
  error,
  onSelectLocality,
  onAnalyticsEvent,
}: Props) {
  const reveal = useRef(new Animated.Value(region ? 1 : 0)).current;
  const requestIdRef = useRef(0);
  const pickerBootRequestIdRef = useRef(0);
  const searchTelemetrySentRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerInitializing, setPickerInitializing] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<GhanaCityTownSuggestion[]>([]);
  const [recent, setRecent] = useState<GhanaCityTownSuggestion[]>([]);
  const [defaultLocalities, setDefaultLocalities] = useState<GhanaCityTownSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const searchExamples = useMemo(() => {
    if (!pickerVisible) return [];
    return getRegionSearchExamples(region);
  }, [pickerVisible, region]);
  const suggested = useMemo(
    () =>
      pickerVisible
        ? getSuggestedLocalities({
            region,
            recent,
            defaults: defaultLocalities,
            limit: 6,
          })
        : [],
    [defaultLocalities, pickerVisible, recent, region],
  );
  const allPlacesPreview = useMemo(() => (pickerVisible ? defaultLocalities.slice(0, 20) : []), [defaultLocalities, pickerVisible]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: region ? 1 : 0,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: true,
    }).start();
  }, [region, reduceMotion, reveal]);

  useEffect(() => {
    if (!region) {
      setRecent([]);
      setDefaultLocalities([]);
      setPickerInitializing(false);
      return;
    }

    if (!pickerVisible) return;

    const nextRequestId = pickerBootRequestIdRef.current + 1;
    pickerBootRequestIdRef.current = nextRequestId;
    const startedAt = Date.now();
    let active = true;
    void Promise.all([
      readRecentGhanaLocalities(region),
      searchGhanaLocalities({
        region,
        limit: 24,
      }),
    ])
      .then(([nextRecent, nextDefaults]) => {
        if (!active) return;
        setRecent(nextRecent);
        setDefaultLocalities(nextDefaults);
      })
      .finally(() => {
        if (!active || pickerBootRequestIdRef.current !== nextRequestId) return;
        const remainingMs = Math.max(0, 120 - (Date.now() - startedAt));
        setTimeout(() => {
          if (active && pickerBootRequestIdRef.current === nextRequestId) {
            setPickerInitializing(false);
          }
        }, remainingMs);
      });

    return () => {
      active = false;
      setPickerInitializing(false);
    };
  }, [pickerVisible, region]);

  useEffect(() => {
    if (!region) {
      setResults([]);
      setLoadingSuggestions(false);
      return;
    }

    const normalizedQuery = search.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      setLoadingSuggestions(false);
      searchTelemetrySentRef.current = false;
      return;
    }

    if (!searchTelemetrySentRef.current) {
      searchTelemetrySentRef.current = true;
      onAnalyticsEvent?.("search_started", {
        region,
        queryLength: normalizedQuery.length,
      });
    }

    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;
    const timeout = setTimeout(async () => {
      setLoadingSuggestions(true);
      const nextSuggestions = await searchGhanaLocalities({
        region,
        query: normalizedQuery,
        limit: 24,
      });
      if (requestIdRef.current !== nextRequestId) return;
      setResults(nextSuggestions);
      setLoadingSuggestions(false);
    }, 220);

    return () => {
      clearTimeout(timeout);
    };
  }, [region, search]);

  const handleSelect = async (selection: GhanaCityTownSuggestion | null) => {
    onSelectLocality(
      selection
        ? {
            ...selection,
            name: normalizeGhanaCityTownValue(selection.name),
          }
        : null,
    );

    if (selection) {
      onAnalyticsEvent?.("locality_selected", {
        region,
        name: selection.name,
        district: selection.district ?? null,
        geonameId: selection.geonameId ?? null,
      });
      await saveRecentGhanaLocality(selection);
      const nextRecents = await readRecentGhanaLocalities(region);
      setRecent(nextRecents);
    } else {
      onAnalyticsEvent?.("locality_cleared", {
        region,
      });
    }

    setSearch("");
    searchTelemetrySentRef.current = false;
    setPickerInitializing(false);
    setPickerVisible(false);
  };

  const openPicker = () => {
    setSearch("");
    searchTelemetrySentRef.current = false;
    setPickerInitializing(true);
    setPickerVisible(true);
    onAnalyticsEvent?.("picker_opened", { region });
  };

  const closePicker = () => {
    searchTelemetrySentRef.current = false;
    setPickerInitializing(false);
    setPickerVisible(false);
  };

  if (!region) return null;

  return (
    <Animated.View
      style={[
        styles.citySection,
        {
          opacity: reveal,
          transform: [
            {
              translateY: reveal.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.citySectionIntro}>Your local community</Text>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>City or town</Text>
        <Text style={styles.optionalLabel}>Required</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          value
            ? `City or town. Selected ${value}${selectedDistrict ? `, ${selectedDistrict}` : ""}.`
            : "City or town. Opens locality search."
        }
        style={[styles.selectBox, value && styles.selectBoxSelected, error && styles.inputError]}
        onPress={openPicker}
      >
        <View style={styles.selectValueWrap}>
          <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>
            {value || "Choose a Ghana city or town"}
          </Text>
          {value && selectedDistrict ? (
            <Text style={styles.selectMetaText} numberOfLines={1}>
              {selectedDistrict}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear selected city or town"
            hitSlop={8}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              void handleSelect(null);
            }}
            style={styles.selectClearButton}
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
          color={value ? styles.tokens.accent.color : styles.tokens.muted.color}
        />
      </Pressable>
      <View style={styles.helperTextRow}>
        <Text style={styles.helperText}>
          Helps us make discovery feel more locally relevant.
        </Text>
        {loadingSuggestions ? (
          <ActivityIndicator size="small" color={styles.tokens.accent.color} />
        ) : null}
      </View>

      {!value ? <Text style={styles.subtleNote}>Choose the place you currently call home.</Text> : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <GhanaCityTownPickerModal
        visible={pickerVisible}
        dark={dark}
        region={region}
        search={search}
        searchExamples={searchExamples}
        suggested={suggested}
        recent={recent}
        preview={allPlacesPreview}
        results={results}
        loading={loadingSuggestions}
        initializing={pickerInitializing}
        selectedLocalityGeonameId={selectedLocalityGeonameId}
        selectedName={value || undefined}
        styles={styles}
        reduceMotion={reduceMotion}
        onClose={closePicker}
        onSearchChange={setSearch}
        onSelect={(selection) => {
          void handleSelect(selection);
        }}
        onClear={() => {
          void handleSelect(null);
        }}
      />
    </Animated.View>
  );
}
