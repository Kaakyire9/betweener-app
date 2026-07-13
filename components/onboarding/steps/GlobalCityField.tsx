import { searchGlobalLocalities } from "@/lib/location/search-global-localities";
import { type GlobalLocalitySuggestion } from "@/lib/location/global-locality-shared";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  countryCode: string;
  countryName: string;
  value: string;
  region?: string | null;
  selectedGeonameId?: number | null;
  dark: boolean;
  styles: any;
  onSelect: (place: GlobalLocalitySuggestion | null) => void;
};

export function GlobalCityField({ countryCode, countryName, value, region, selectedGeonameId, dark, styles, onSelect }: Props) {
  const requestRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalLocalitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const palette = dark
    ? { bg: "#071414", card: "#102020", text: "#F6FBFA", muted: "#91A6A3", border: "#29413E" }
    : { bg: "#FFF9F2", card: "#FFFFFF", text: "#241B18", muted: "#776D68", border: "#E5DCD5" };

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
        const next = await searchGlobalLocalities({ countryCode, query: normalized, limit: 24 });
        if (requestRef.current === requestId) setResults(next);
      } catch {
        if (requestRef.current === requestId) setError("We couldn't load places. Check your connection and try again.");
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [countryCode, query, visible]);

  const close = () => { setVisible(false); setQuery(""); setResults([]); setError(""); };
  return (
    <View style={styles.citySection}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>Current city</Text><Text style={styles.optionalLabel}>Optional</Text>
      </View>
      <Pressable style={[styles.selectBox, value && styles.selectBoxSelected]} onPress={() => setVisible(true)} accessibilityRole="button" accessibilityLabel={value ? `Current city, ${value}, ${region || countryName}` : `Choose a city in ${countryName}`}>
        <View style={styles.selectValueWrap}>
          <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>{value || `Choose a city in ${countryName}`}</Text>
          {value && region ? <Text style={styles.selectMetaText}>{region}</Text> : null}
        </View>
        {value ? <Pressable hitSlop={8} accessibilityLabel="Clear current city" onPress={(event) => { event.stopPropagation(); onSelect(null); }}><MaterialCommunityIcons name="close-circle-outline" size={18} color={styles.tokens.muted.color} /></Pressable> : null}
        <MaterialCommunityIcons name="chevron-right" size={20} color={styles.tokens.accent.color} />
      </Pressable>
      <Text style={styles.helperText}>Selecting a city fills its correct region automatically.</Text>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <SafeAreaView style={[local.modal, { backgroundColor: palette.bg }]}>
          <View style={[local.header, { borderBottomColor: palette.border }]}>
            <Pressable onPress={close}><Text style={[local.action, { color: palette.muted }]}>Cancel</Text></Pressable>
            <View style={local.titleWrap}><Text style={[local.title, { color: palette.text }]}>Choose your city</Text><Text style={[local.subtitle, { color: palette.muted }]}>{countryName}</Text></View>
            <View style={local.actionSpacer} />
          </View>
          <View style={[local.search, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <MaterialCommunityIcons name="magnify" size={20} color={palette.muted} />
            <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={`Search cities in ${countryName}`} placeholderTextColor={palette.muted} style={[local.searchInput, { color: palette.text }]} autoCorrect={false} />
            {loading ? <ActivityIndicator size="small" color={styles.tokens.accent.color} /> : null}
          </View>
          {query.trim().length < 2 ? <Text style={[local.guidance, { color: palette.muted }]}>Type at least two letters. Results are limited to {countryName}.</Text> : null}
          {error ? <Text style={local.error}>{error}</Text> : null}
          {!loading && query.trim().length >= 2 && !results.length && !error ? <Text style={[local.guidance, { color: palette.muted }]}>No matching city or town found.</Text> : null}
          <FlatList data={results} keyboardShouldPersistTaps="handled" keyExtractor={(item) => String(item.geonameId)} contentContainerStyle={local.list} renderItem={({ item }) => {
            const selected = selectedGeonameId === item.geonameId;
            return <Pressable style={[local.row, { backgroundColor: palette.card, borderColor: selected ? styles.tokens.accent.color : palette.border }]} onPress={() => { onSelect(item); close(); }}>
              <View style={local.pin}><MaterialCommunityIcons name="map-marker-outline" size={20} color={styles.tokens.accent.color} /></View>
              <View style={local.rowCopy}><Text style={[local.rowTitle, { color: palette.text }]}>{item.name}</Text><Text style={[local.rowMeta, { color: palette.muted }]}>{[item.admin1Name, item.countryName].filter(Boolean).join(" · ")}</Text></View>
              {selected ? <MaterialCommunityIcons name="check-circle" size={21} color={styles.tokens.accent.color} /> : null}
            </Pressable>;
          }} />
          <Text style={[local.attribution, { color: palette.muted }]}>Place data © GeoNames contributors</Text>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const local = StyleSheet.create({
  modal: { flex: 1 }, header: { minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, flexDirection: "row", alignItems: "center" },
  action: { width: 70, fontSize: 16 }, actionSpacer: { width: 70 }, titleWrap: { flex: 1, alignItems: "center" }, title: { fontSize: 18, fontWeight: "700" }, subtitle: { fontSize: 12, marginTop: 2 },
  search: { margin: 18, height: 54, borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 }, searchInput: { flex: 1, fontSize: 16 },
  guidance: { paddingHorizontal: 22, paddingVertical: 12, fontSize: 14, lineHeight: 20 }, error: { color: "#C94C4C", paddingHorizontal: 22, paddingVertical: 10 }, list: { paddingHorizontal: 18, paddingBottom: 12, gap: 9 },
  row: { minHeight: 70, borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 }, pin: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(129,80,255,0.10)" }, rowCopy: { flex: 1 }, rowTitle: { fontSize: 16, fontWeight: "700" }, rowMeta: { marginTop: 4, fontSize: 13 }, attribution: { textAlign: "center", fontSize: 11, paddingVertical: 10 },
});
