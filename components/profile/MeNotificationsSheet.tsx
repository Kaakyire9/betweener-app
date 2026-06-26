import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import {
  NOTIFICATION_CONTROL_OPTIONS,
  NOTIFICATION_CORE_OPTIONS,
  NOTIFICATION_OPTIONAL_OPTIONS,
  QUIET_HOURS_PRESETS,
} from "@/lib/profile/me-screen-config";

type Theme = typeof Colors.light;

type NotificationPrefsShape = {
  push_enabled: boolean;
  inapp_enabled: boolean;
  messages: boolean;
  message_reactions: boolean;
  profile_interest: boolean;
  reactions: boolean;
  likes: boolean;
  superlikes: boolean;
  matches: boolean;
  moments: boolean;
  verification: boolean;
  announcements: boolean;
  preview_text: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_tz: string;
};

type Props = {
  visible: boolean;
  theme: Theme;
  isDark: boolean;
  notificationPrefs: NotificationPrefsShape;
  notificationPrefsLoaded: boolean;
  quietHoursPreview: string | null;
  activeQuietPresetId?: string;
  showStartPicker: boolean;
  showEndPicker: boolean;
  startPickerValue: Date;
  endPickerValue: Date;
  quietHoursLabel: (value: string) => string;
  onClose: () => void;
  onTogglePref: (key: string, value: boolean) => void;
  onUpdateQuietHours: (enabled: boolean, start: string, end: string) => void;
  onShowStartPicker: () => void;
  onShowEndPicker: () => void;
  onStartChange: (event: DateTimePickerEvent, selected?: Date) => void;
  onEndChange: (event: DateTimePickerEvent, selected?: Date) => void;
  styles: any;
};

function NotificationToggleCard({
  label,
  description,
  icon,
  value,
  onValueChange,
  theme,
  styles,
}: {
  label: string;
  description: string;
  icon: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: Theme;
  styles: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => onValueChange(!value)}
      style={[
        styles.notificationToggleCard,
        { backgroundColor: theme.backgroundSubtle, borderColor: value ? theme.tint : theme.outline },
      ]}
    >
      <View
        style={[
          styles.notificationToggleIcon,
          { backgroundColor: value ? `${theme.tint}18` : theme.background },
        ]}
      >
        <MaterialCommunityIcons name={icon as any} size={18} color={value ? theme.tint : theme.textMuted} />
      </View>
      <View style={styles.notificationToggleCopy}>
        <View style={styles.notificationToggleTitleRow}>
          <Text style={[styles.notificationToggleLabel, { color: theme.text }]}>{label}</Text>
        </View>
        <Text style={[styles.notificationToggleDescription, { color: theme.textMuted }]}>
          {description}
        </Text>
      </View>
      <View
        style={[
          styles.notificationToggleControl,
          {
            backgroundColor: value ? `${theme.tint}14` : theme.background,
            borderColor: value ? `${theme.tint}3a` : theme.outline,
          },
        ]}
      >
        <Text style={[styles.notificationToggleControlText, { color: value ? theme.tint : theme.textMuted }]}>
          {value ? "Live" : "Mute"}
        </Text>
        <View
          style={[
            styles.notificationToggleControlTrack,
            { backgroundColor: value ? theme.tint : theme.outline },
          ]}
        >
          <View
            style={[
              styles.notificationToggleControlThumb,
              value ? styles.notificationToggleControlThumbOn : styles.notificationToggleControlThumbOff,
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MeNotificationsSheet({
  visible,
  theme,
  isDark,
  notificationPrefs,
  notificationPrefsLoaded,
  quietHoursPreview,
  activeQuietPresetId,
  showStartPicker,
  showEndPicker,
  startPickerValue,
  endPickerValue,
  quietHoursLabel,
  onClose,
  onTogglePref,
  onUpdateQuietHours,
  onShowStartPicker,
  onShowEndPicker,
  onStartChange,
  onEndChange,
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
            styles.notificationStudioCard,
            { backgroundColor: theme.background, borderColor: theme.outline },
          ]}
        >
          <View style={styles.notificationModalHeader}>
            <View style={styles.appearanceHeaderCopy}>
              <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Notifications</Text>
              <Text style={[styles.appearanceHeaderBody, { color: theme.textMuted }]}>
                Shape the signal you want Betweener to carry, surface, or keep quiet.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.notificationStudioContent} showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.notificationHeroCard,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["rgba(18,53,53,0.96)", "rgba(27,32,27,0.98)", "rgba(58,46,18,0.94)"]
                    : ["#FFF6E8", "#E8F8F5", "#FFF1D2"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.notificationHeroGradient}
              >
                <View style={styles.notificationHeroArtwork} pointerEvents="none">
                  <View
                    style={[
                      styles.notificationHeroRingLarge,
                      { borderColor: isDark ? "rgba(245,211,107,0.16)" : "rgba(15,118,110,0.12)" },
                    ]}
                  />
                  <View
                    style={[
                      styles.notificationHeroRingSmall,
                      { borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,118,110,0.1)" },
                    ]}
                  />
                  <View
                    style={[
                      styles.notificationHeroPulseDot,
                      { backgroundColor: isDark ? "#F5D36B" : "#0F766E" },
                    ]}
                  />
                  <View
                    style={[
                      styles.notificationHeroOrbitDot,
                      { backgroundColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(15,118,110,0.18)" },
                    ]}
                  />
                </View>
                <Text style={[styles.notificationHeroEyebrow, { color: isDark ? "#F5D36B" : "#946A08" }]}>
                  Private signal room
                </Text>
                <Text style={[styles.notificationHeroTitle, { color: theme.text }]}>
                  {notificationPrefs.push_enabled ? "You are fully reachable" : "Signals stay mostly inside the app"}
                </Text>
                <Text style={[styles.notificationHeroBody, { color: theme.textMuted }]}>
                  {notificationPrefs.quiet_hours_enabled
                    ? `Quiet hours protect ${quietHoursLabel(notificationPrefs.quiet_hours_start)}-${quietHoursLabel(notificationPrefs.quiet_hours_end)}.`
                    : "You can soften nights with quiet hours whenever you want."}
                </Text>
                <View style={styles.notificationHeroChipRow}>
                  <View style={[styles.notificationHeroChip, { backgroundColor: theme.background, borderColor: theme.outline }]}>
                    <MaterialCommunityIcons name="bell-ring-outline" size={13} color={theme.tint} />
                    <Text style={[styles.notificationHeroChipText, { color: theme.text }]}>
                      {notificationPrefs.push_enabled ? "Push on" : "Push off"}
                    </Text>
                  </View>
                  <View style={[styles.notificationHeroChip, { backgroundColor: theme.background, borderColor: theme.outline }]}>
                    <MaterialCommunityIcons name="theme-light-dark" size={13} color={theme.tint} />
                    <Text style={[styles.notificationHeroChipText, { color: theme.text }]}>
                      {notificationPrefs.preview_text ? "Preview visible" : "Preview hidden"}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.notificationSection}>
              <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Core signals</Text>
              <View style={styles.notificationCardGrid}>
                {NOTIFICATION_CORE_OPTIONS.map((item) => (
                  <NotificationToggleCard
                    key={item.key}
                    label={item.label}
                    description={item.body}
                    icon={item.icon}
                    value={notificationPrefs[item.key]}
                    onValueChange={(val) => onTogglePref(item.key, val)}
                    theme={theme}
                    styles={styles}
                  />
                ))}
              </View>
            </View>

            <View style={styles.notificationSection}>
              <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Control room</Text>
              <View style={styles.notificationCardGrid}>
                {NOTIFICATION_CONTROL_OPTIONS.map((item) => (
                  <NotificationToggleCard
                    key={item.key}
                    label={item.label}
                    description={item.body}
                    icon={item.icon}
                    value={notificationPrefs[item.key]}
                    onValueChange={(val) => onTogglePref(item.key, val)}
                    theme={theme}
                    styles={styles}
                  />
                ))}
              </View>
            </View>

            <View style={styles.notificationSection}>
              <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Quiet hours</Text>
              <View
                style={[
                  styles.quietHoursStudioCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <NotificationToggleCard
                  label="Silence pushes"
                  description="Hold alerts back when the day should go still."
                  icon="weather-night"
                  value={notificationPrefs.quiet_hours_enabled}
                  onValueChange={(val) =>
                    onUpdateQuietHours(val, notificationPrefs.quiet_hours_start, notificationPrefs.quiet_hours_end)
                  }
                  theme={theme}
                  styles={styles}
                />
                {notificationPrefs.quiet_hours_enabled ? (
                  <>
                    <View style={styles.quietHoursSummaryRow}>
                      <View style={[styles.quietHoursSummaryPill, { backgroundColor: theme.background, borderColor: theme.outline }]}>
                        <MaterialCommunityIcons name="clock-time-four-outline" size={13} color={theme.tint} />
                        <Text style={[styles.quietHoursSummaryText, { color: theme.text }]}>
                          {`${quietHoursLabel(notificationPrefs.quiet_hours_start)}-${quietHoursLabel(notificationPrefs.quiet_hours_end)}`}
                        </Text>
                      </View>
                      {quietHoursPreview ? (
                        <Text style={[styles.quietHoursSummaryMeta, { color: theme.textMuted }]}>{quietHoursPreview}</Text>
                      ) : null}
                    </View>
                    <View style={styles.quietHoursPills}>
                      {QUIET_HOURS_PRESETS.map((preset) => {
                        const active = activeQuietPresetId === preset.id;
                        return (
                          <TouchableOpacity
                            key={preset.id}
                            style={[
                              styles.quietHoursPill,
                              { backgroundColor: theme.background, borderColor: theme.outline },
                              active && { backgroundColor: theme.tint, borderColor: theme.tint },
                            ]}
                            onPress={() => onUpdateQuietHours(true, preset.start, preset.end)}
                          >
                            <Text
                              style={[
                                styles.quietHoursPillText,
                                { color: theme.text },
                                active && { color: "#fff" },
                              ]}
                            >
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.quietHoursCustomRow}>
                      <TouchableOpacity
                        style={[
                          styles.quietHoursInput,
                          { borderColor: theme.outline, backgroundColor: theme.background },
                        ]}
                        onPress={onShowStartPicker}
                      >
                        <Text style={[styles.quietHoursInputText, { color: theme.text }]}>
                          {quietHoursLabel(notificationPrefs.quiet_hours_start)}
                        </Text>
                      </TouchableOpacity>
                      <Text style={[styles.quietHoursDash, { color: theme.textMuted }]}>to</Text>
                      <TouchableOpacity
                        style={[
                          styles.quietHoursInput,
                          { borderColor: theme.outline, backgroundColor: theme.background },
                        ]}
                        onPress={onShowEndPicker}
                      >
                        <Text style={[styles.quietHoursInputText, { color: theme.text }]}>
                          {quietHoursLabel(notificationPrefs.quiet_hours_end)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {showStartPicker ? (
                      <DateTimePicker
                        mode="time"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        value={startPickerValue}
                        onChange={onStartChange}
                      />
                    ) : null}
                    {showEndPicker ? (
                      <DateTimePicker
                        mode="time"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        value={endPickerValue}
                        onChange={onEndChange}
                      />
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.quietHoursSummaryMeta, { color: theme.textMuted }]}>
                    Quiet hours are off. Betweener can still respect your push and preview choices above.
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.notificationSection}>
              <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Optional signals</Text>
              <View style={styles.notificationCardGrid}>
                {NOTIFICATION_OPTIONAL_OPTIONS.map((item) => (
                  <NotificationToggleCard
                    key={item.key}
                    label={item.label}
                    description={item.body}
                    icon={item.icon}
                    value={notificationPrefs[item.key]}
                    onValueChange={(val) => onTogglePref(item.key, val)}
                    theme={theme}
                    styles={styles}
                  />
                ))}
              </View>
            </View>

            {!notificationPrefsLoaded ? (
              <Text style={[styles.notificationLoading, { color: theme.textMuted }]}>
                Loading preferences...
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
