import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

type ReligionOption = { label: string };

type Props = {
  options: readonly ReligionOption[];
  selectedValue: string;
  styles: any;
  onSelect: (value: string) => void;
};

const PRIMARY_VALUES = ["Christian", "Muslim", "Traditionalist", "Spiritual", "No religion"];

const VALUE_META: Record<string, { icon: string; description: string }> = {
  Christian: { icon: "cross", description: "Christian faith and tradition" },
  Muslim: { icon: "moon-waning-crescent", description: "Islamic faith and practice" },
  Traditionalist: { icon: "tree-outline", description: "Traditional or ancestral spirituality" },
  Spiritual: { icon: "shimmer", description: "Spiritual, without one tradition" },
  "No religion": { icon: "compass-outline", description: "Not religious" },
  Jewish: { icon: "star-david", description: "Jewish faith and tradition" },
  Hindu: { icon: "flower-outline", description: "Hindu faith and tradition" },
  Buddhist: { icon: "meditation", description: "Buddhist faith and practice" },
  Other: { icon: "dots-horizontal-circle-outline", description: "Another faith or worldview" },
};

function getMeta(label: string) {
  return VALUE_META[label] ?? { icon: "compass-outline", description: "Your faith or worldview" };
}

export function PremiumValuesSelector({ options, selectedValue, styles, onSelect }: Props) {
  const [editing, setEditing] = useState(!selectedValue);
  const [showMore, setShowMore] = useState(false);
  const primaryOptions = useMemo(
    () => PRIMARY_VALUES.map((label) => options.find((option) => option.label === label)).filter(Boolean) as ReligionOption[],
    [options],
  );
  const moreOptions = useMemo(
    () => options.filter((option) => !PRIMARY_VALUES.includes(option.label)),
    [options],
  );

  if (selectedValue && !editing) {
    const meta = getMeta(selectedValue);
    return (
      <View>
        <View style={styles.valuesSelectedCard}>
          <View style={styles.valuesSelectedLead}>
            <View style={styles.valuesSelectedIcon}>
              <MaterialCommunityIcons name={meta.icon as any} size={23} color={styles.tokens.accent.color} />
            </View>
            <View style={styles.valuesSelectedCopy}>
              <Text style={styles.valuesSelectedEyebrow}>FAITH & WORLDVIEW</Text>
              <Text style={styles.valuesSelectedTitle}>{selectedValue}</Text>
              <Text style={styles.valuesSelectedDescription}>{meta.description}</Text>
            </View>
          </View>
          <Pressable style={styles.valuesChangeButton} onPress={() => setEditing(true)}>
            <Text style={styles.valuesChangeText}>Change</Text>
          </Pressable>
        </View>
        <View style={styles.valuesPrivacyCard}>
          <View style={styles.valuesPrivacyIcon}>
            <MaterialCommunityIcons name="shield-lock-outline" size={18} color={styles.tokens.accent.color} />
          </View>
          <View style={styles.valuesSelectedCopy}>
            <Text style={styles.valuesPrivacyTitle}>You stay in control</Text>
            <Text style={styles.valuesPrivacyText}>You can change what appears on your profile anytime.</Text>
          </View>
        </View>
      </View>
    );
  }

  const renderOption = (option: ReligionOption) => {
    const meta = getMeta(option.label);
    const selected = selectedValue === option.label;
    return (
      <Pressable
        key={option.label}
        style={[styles.valuesOption, selected && styles.valuesOptionSelected]}
        onPress={() => {
          onSelect(option.label);
          setEditing(false);
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        <View style={[styles.valuesOptionIcon, selected && styles.valuesOptionIconSelected]}>
          <MaterialCommunityIcons
            name={meta.icon as any}
            size={20}
            color={selected ? styles.tokens.accent.color : styles.tokens.muted.color}
          />
        </View>
        <View style={styles.valuesSelectedCopy}>
          <Text style={[styles.valuesOptionTitle, selected && styles.valuesOptionTitleSelected]}>{option.label}</Text>
          <Text style={[styles.valuesOptionDescription, selected && styles.valuesOptionDescriptionSelected]}>
            {meta.description}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={selected ? "radiobox-marked" : "radiobox-blank"}
          size={20}
          color={selected ? styles.tokens.accent.color : styles.tokens.muted.color}
        />
      </Pressable>
    );
  };

  return (
    <View>
      <View style={styles.valuesSectionHeader}>
        <Text style={styles.valuesSectionLabel}>FAITH & WORLDVIEW</Text>
        <View style={styles.valuesPrivatePill}>
          <MaterialCommunityIcons name="lock-outline" size={12} color={styles.tokens.muted.color} />
          <Text style={styles.valuesPrivatePillText}>Your choice</Text>
        </View>
      </View>
      <View style={styles.valuesOptionStack}>{primaryOptions.map(renderOption)}</View>
      {moreOptions.length ? (
        <>
          <Pressable style={styles.valuesMoreButton} onPress={() => setShowMore((value) => !value)}>
            <View style={styles.valuesMoreLead}>
              <MaterialCommunityIcons name="compass-rose" size={18} color={styles.tokens.accent.color} />
              <Text style={styles.valuesMoreText}>{showMore ? "Show fewer paths" : "More paths"}</Text>
            </View>
            <MaterialCommunityIcons
              name={showMore ? "chevron-up" : "chevron-down"}
              size={20}
              color={styles.tokens.accent.color}
            />
          </Pressable>
          {showMore ? <View style={[styles.valuesOptionStack, styles.valuesMoreStack]}>{moreOptions.map(renderOption)}</View> : null}
        </>
      ) : null}
      <View style={styles.valuesPrivacyNote}>
        <MaterialCommunityIcons name="shield-check-outline" size={16} color={styles.tokens.muted.color} />
        <Text style={styles.valuesPrivacyNoteText}>Choose only what feels accurate for you.</Text>
      </View>
    </View>
  );
}
