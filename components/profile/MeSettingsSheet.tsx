import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { SETTINGS_MENU_ITEMS } from "@/lib/profile/me-screen-config";

type Theme = typeof Colors.light;

type Props = {
  visible: boolean;
  theme: Theme;
  canSeeAdminTools: boolean;
  onClose: () => void;
  onItemPress: (itemId: string) => void;
  styles: any;
};

const getHelperText = (itemId: string) => {
  switch (itemId) {
    case "appearance":
      return "Switch light, dark, or follow your device.";
    case "notifications":
      return "Choose what reaches you and when.";
    case "email":
      return "Manage sign-in methods and recovery.";
    case "privacy":
      return "Safety tools, blocks, and trust controls.";
    case "preferences":
      return "Guide who enters your dating room.";
    case "premium":
      return "Review plans, pricing, and benefits.";
    case "help":
      return "Support, answers, and product guidance.";
    case "admin":
      return "Internal moderation and operations tools.";
    case "logout":
      return "Sign out of this account on this device.";
    default:
      return "";
  }
};

export default function MeSettingsSheet({
  visible,
  theme,
  canSeeAdminTools,
  onClose,
  onItemPress,
  styles,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.notificationModalBackdrop}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill} />

        <View
          style={[
            styles.settingsSheet,
            styles.cardShadow,
            { backgroundColor: theme.background, borderColor: theme.outline },
          ]}
        >
          <View style={styles.notificationModalHeader}>
            <View style={styles.appearanceHeaderCopy}>
              <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Settings</Text>
              <Text style={[styles.appearanceHeaderBody, { color: theme.textMuted }]}>
                Adjust the parts of Betweener that shape your account, privacy, and experience.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.settingsSheetContent}
          >
            {SETTINGS_MENU_ITEMS.filter((item) => {
              if (item.adminOnly) return canSeeAdminTools;
              return true;
            }).map((item) => {
              if (item.type === "divider") {
                return (
                  <View
                    key={item.id}
                    style={[styles.dropdownDivider, { backgroundColor: theme.outline }]}
                  />
                );
              }

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.settingsSheetItem,
                    { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                    item.id === "logout" && {
                      backgroundColor: theme.tint + "10",
                      borderColor: theme.tint + "30",
                    },
                  ]}
                  activeOpacity={0.9}
                  onPress={() => onItemPress(item.id)}
                >
                  <View style={[styles.settingsSheetIcon, { backgroundColor: theme.background }]}>
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={18}
                      color={item.id === "logout" ? theme.tint : item.color}
                    />
                  </View>
                  <View style={styles.settingsSheetCopy}>
                    <Text
                      style={[
                        styles.settingsSheetTitle,
                        { color: item.id === "logout" ? theme.tint : theme.text },
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.settingsSheetBody, { color: theme.textMuted }]}>
                      {getHelperText(item.id)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
