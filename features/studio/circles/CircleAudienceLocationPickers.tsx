import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPrioritizedCountries, type CountryOption } from '@/lib/location/countries';
import type { GlobalLocalitySuggestion } from '@/lib/location/global-locality-shared';
import { searchGlobalLocalities } from '@/lib/location/search-global-localities';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CountryPickerProps = {
  visible: boolean;
  title: string;
  selectedCodes: string[];
  multiple?: boolean;
  onClose: () => void;
  onSelect: (country: CountryOption) => void;
};

export function CircleCountryPickerModal({
  visible,
  title,
  selectedCodes,
  multiple = false,
  onClose,
  onSelect,
}: CountryPickerProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const countries = useMemo(() => getPrioritizedCountries(query), [query]);
  const selected = useMemo(
    () => new Set(selectedCodes.map((code) => code.trim().toUpperCase())),
    [selectedCodes],
  );

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close country picker" style={styles.iconButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={22} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          {multiple ? (
            <Pressable accessibilityRole="button" style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : <View style={styles.iconButton} />}
        </View>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
          <TextInput
            autoFocus
            accessibilityLabel="Search countries"
            value={query}
            onChangeText={setQuery}
            placeholder="Search country"
            placeholderTextColor={theme.textMuted}
            style={styles.searchInput}
          />
        </View>
        <FlatList
          data={countries}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.code);
            return (
              <Pressable
                accessibilityRole={multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: isSelected }}
                style={[styles.row, isSelected && styles.rowSelected]}
                onPress={() => onSelect(item)}
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.label}</Text>
                  <Text style={styles.rowMeta}>{item.code}</Text>
                </View>
                <MaterialCommunityIcons
                  name={isSelected ? 'check-circle' : 'chevron-right'}
                  size={21}
                  color={isSelected ? theme.tint : theme.textMuted}
                />
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

type CityPickerProps = {
  visible: boolean;
  countryCode: string;
  countryName: string;
  selectedCity?: string | null;
  onClose: () => void;
  onSelect: (place: GlobalLocalitySuggestion) => void;
};

export function CircleCityPickerModal({
  visible,
  countryCode,
  countryName,
  selectedCity,
  onClose,
  onSelect,
}: CityPickerProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const requestRef = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalLocalitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (!visible || normalized.length < 2 || countryCode.length !== 2) {
      setResults([]);
      setLoading(false);
      setError('');
      return;
    }

    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const next = await searchGlobalLocalities({ countryCode, query: normalized, limit: 24 });
        if (requestRef.current === requestId) setResults(next);
      } catch {
        if (requestRef.current === requestId) setError("We couldn't load cities. Check your connection and try again.");
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [countryCode, query, visible]);

  const close = () => {
    setQuery('');
    setResults([]);
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close city picker" style={styles.iconButton} onPress={close}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>City or town</Text>
          <View style={styles.iconButton} />
        </View>
        <Text style={styles.intro}>Choose the locality this Circle serves in {countryName}.</Text>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
          <TextInput
            autoFocus
            accessibilityLabel={`Search cities in ${countryName}`}
            value={query}
            onChangeText={setQuery}
            placeholder={`Search cities in ${countryName}`}
            placeholderTextColor={theme.textMuted}
            style={styles.searchInput}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {loading ? <ActivityIndicator size="small" color={theme.tint} /> : null}
        </View>
        {query.trim().length < 2 ? <Text style={styles.guidance}>Type at least two letters.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.geonameId)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isSelected = selectedCity?.trim().toLowerCase() === item.name.trim().toLowerCase();
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                style={[styles.row, isSelected && styles.rowSelected]}
                onPress={() => { onSelect(item); close(); }}
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowMeta}>{[item.admin1Name, item.countryName].filter(Boolean).join(' · ')}</Text>
                </View>
                <MaterialCommunityIcons name={isSelected ? 'check-circle' : 'chevron-right'} size={21} color={isSelected ? theme.tint : theme.textMuted} />
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  header: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.outline },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: theme.text, fontSize: 18, textAlign: 'center', fontFamily: 'Archivo_700Bold' },
  doneButton: { minWidth: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: theme.tint, fontSize: 13, fontFamily: 'Archivo_700Bold' },
  intro: { color: theme.textMuted, paddingHorizontal: 20, paddingTop: 18, fontSize: 13, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  searchBox: { minHeight: 54, margin: 20, marginBottom: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  searchInput: { flex: 1, color: theme.text, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  guidance: { color: theme.textMuted, paddingHorizontal: 20, paddingBottom: 8, fontSize: 12, fontFamily: 'Manrope_500Medium' },
  error: { color: '#D85A5A', paddingHorizontal: 20, paddingBottom: 8, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  list: { paddingHorizontal: 20, paddingBottom: 28 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.outline },
  rowSelected: { borderRadius: 15, borderBottomColor: 'transparent', backgroundColor: theme.backgroundSubtle },
  rowCopy: { flex: 1 },
  rowTitle: { color: theme.text, fontSize: 15, fontFamily: 'Manrope_700Bold' },
  rowMeta: { marginTop: 3, color: theme.textMuted, fontSize: 12, fontFamily: 'Manrope_500Medium' },
});
