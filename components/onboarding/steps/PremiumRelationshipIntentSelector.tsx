import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type IntentOption = {
  value: string;
  label: string;
  description: string;
  icon: string;
};

type Props = {
  intents: readonly IntentOption[];
  selectedValue: string;
  styles: any;
  onSelect: (value: string) => void;
};

export function PremiumRelationshipIntentSelector({ intents, selectedValue, styles, onSelect }: Props) {
  return (
    <View>
      <View style={styles.intentSectionHeader}>
        <Text style={styles.intentSectionLabel}>YOUR DIRECTION</Text>
        {selectedValue ? (
          <View style={styles.intentChosenPill}>
            <MaterialCommunityIcons name="check" size={12} color={styles.tokens.accent.color} />
            <Text style={styles.intentChosenText}>Direction chosen</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.intentOptionStack}>
        {intents.map((intent) => {
          const selected = selectedValue === intent.value;
          return (
            <Pressable
              key={intent.value}
              style={[styles.intentOption, selected && styles.intentOptionSelected]}
              onPress={() => onSelect(intent.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[styles.intentOptionIcon, selected && styles.intentOptionIconSelected]}>
                <MaterialCommunityIcons
                  name={intent.icon as any}
                  size={21}
                  color={selected ? styles.tokens.accent.color : styles.tokens.muted.color}
                />
              </View>
              <View style={styles.intentOptionCopy}>
                <Text style={[styles.intentOptionTitle, selected && styles.intentOptionTitleSelected]}>
                  {intent.label}
                </Text>
                <Text style={[styles.intentOptionDescription, selected && styles.intentOptionDescriptionSelected]}>
                  {intent.description}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={selected ? "radiobox-marked" : "radiobox-blank"}
                size={21}
                color={selected ? styles.tokens.accent.color : styles.tokens.muted.color}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.intentReassuranceCard}>
        <View style={styles.intentReassuranceIcon}>
          <MaterialCommunityIcons name="refresh" size={18} color={styles.tokens.accent.color} />
        </View>
        <View style={styles.intentOptionCopy}>
          <Text style={styles.intentReassuranceTitle}>Your direction can evolve</Text>
          <Text style={styles.intentReassuranceText}>There’s no wrong answer, and you can change this anytime.</Text>
        </View>
      </View>
    </View>
  );
}
