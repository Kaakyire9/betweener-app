import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";

type Theme = typeof Colors.light;
type AppearanceChoice = "light" | "dark" | "system";

type Props = {
  visible: boolean;
  theme: Theme;
  isDark: boolean;
  colorScheme: "light" | "dark" | null | undefined;
  themePreference: AppearanceChoice;
  onClose: () => void;
  onChoose: (choice: AppearanceChoice) => void;
  styles: any;
};

const OPTIONS: {
  id: AppearanceChoice;
  title: string;
  body: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}[] = [
  {
    id: "light",
    title: "Light",
    body: "Warm, bright, and polished across Betweener.",
    icon: "white-balance-sunny",
  },
  {
    id: "dark",
    title: "Dark",
    body: "Calmer at night and stronger around photos and media.",
    icon: "weather-night",
  },
  {
    id: "system",
    title: "Follow device",
    body: "Stay aligned with your phone automatically.",
    icon: "cellphone-cog",
  },
];

export default function MeAppearanceSheet({
  visible,
  theme,
  isDark,
  colorScheme,
  themePreference,
  onClose,
  onChoose,
  styles,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.notificationModalBackdrop}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={[
            styles.notificationModalCard,
            styles.cardShadow,
            { backgroundColor: theme.background, borderColor: theme.outline },
          ]}
        >
          <View style={styles.notificationModalHeader}>
            <View style={styles.appearanceHeaderCopy}>
              <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Appearance</Text>
              <Text style={[styles.appearanceHeaderBody, { color: theme.textMuted }]}>
                Choose how Betweener should feel when you open it.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.appearancePreviewCard,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
            ]}
          >
            <LinearGradient
              colors={
                isDark
                  ? ["rgba(18,53,53,0.96)", "rgba(15,26,26,0.98)"]
                  : ["#F7EFE4", "#E8F8F5", "#FFF6D8"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.appearancePreviewGradient}
            >
              <Text
                style={[
                  styles.appearancePreviewEyebrow,
                  { color: isDark ? "#F5D36B" : "#946A08" },
                ]}
              >
                Betweener mood
              </Text>
              <Text style={[styles.appearancePreviewTitle, { color: theme.text }]}>
                {themePreference === "system"
                  ? "Following your device"
                  : themePreference === "dark"
                    ? "Dark mode is active"
                    : "Light mode is active"}
              </Text>
              <Text style={[styles.appearancePreviewBody, { color: theme.textMuted }]}>
                {themePreference === "system"
                  ? `Right now your device is using ${colorScheme}. Betweener will follow automatically.`
                  : "Your choice applies across the app immediately."}
              </Text>
              <View style={styles.appearancePreviewChipRow}>
                <View
                  style={[
                    styles.appearancePreviewChip,
                    { backgroundColor: theme.background, borderColor: theme.outline },
                  ]}
                >
                  <MaterialCommunityIcons name="theme-light-dark" size={13} color={theme.tint} />
                  <Text style={[styles.appearancePreviewChipText, { color: theme.text }]}>
                    {themePreference === "system"
                      ? "Follow device"
                      : themePreference === "dark"
                        ? "Dark mode"
                        : "Light mode"}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.appearanceOptionList}>
            {OPTIONS.map((option) => {
              const active = themePreference === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.appearanceOptionCard,
                    {
                      backgroundColor: theme.backgroundSubtle,
                      borderColor: active ? theme.tint : theme.outline,
                    },
                    active && [styles.cardShadowSoft, { shadowColor: theme.tint }],
                  ]}
                  activeOpacity={0.9}
                  onPress={() => onChoose(option.id)}
                >
                  <View
                    style={[
                      styles.appearanceOptionIcon,
                      { backgroundColor: active ? `${theme.tint}18` : theme.background },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={option.icon}
                      size={18}
                      color={active ? theme.tint : theme.textMuted}
                    />
                  </View>
                  <View style={styles.appearanceOptionCopy}>
                    <View style={styles.appearanceOptionTitleRow}>
                      <Text style={[styles.appearanceOptionTitle, { color: theme.text }]}>
                        {option.title}
                      </Text>
                      {active ? (
                        <View
                          style={[
                            styles.appearanceActivePill,
                            { backgroundColor: `${theme.tint}14`, borderColor: `${theme.tint}3a` },
                          ]}
                        >
                          <Text style={[styles.appearanceActivePillText, { color: theme.tint }]}>
                            Active
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.appearanceOptionBody, { color: theme.textMuted }]}>
                      {option.body}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
