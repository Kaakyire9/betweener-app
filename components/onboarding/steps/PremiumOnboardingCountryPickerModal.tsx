import { type CountryOption } from "@/lib/location/countries";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";

type Props = {
  visible: boolean;
  title: string;
  dark: boolean;
  search: string;
  countries: CountryOption[];
  selectedCode?: string;
  styles: any;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (country: CountryOption) => void;
};

export function PremiumOnboardingCountryPickerModal({
  visible,
  title,
  dark,
  search,
  countries,
  selectedCode,
  styles,
  onClose,
  onSearchChange,
  onSelect,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalScreen} edges={["top"]}>
        <View style={styles.modalHeader}>
          <Pressable style={styles.modalClose} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={22} color={dark ? "#F4EBDD" : "#071E22"} />
          </Pressable>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={styles.modalClose} />
        </View>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color={styles.tokens.muted.color} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search country"
            placeholderTextColor={styles.tokens.muted.color}
            style={styles.searchInput}
          />
        </View>
        <FlatList
          data={countries}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.countryListContent}
          renderItem={({ item }) => {
            const selected = selectedCode === item.code;
            return (
              <Pressable style={[styles.countryRow, selected && styles.countryRowSelected]} onPress={() => onSelect(item)}>
                <Text style={styles.countryName}>{item.label}</Text>
                <Text style={styles.countryDial}>{item.code}</Text>
                {selected ? <MaterialCommunityIcons name="check-circle" size={20} color={styles.tokens.accent.color} /> : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}
