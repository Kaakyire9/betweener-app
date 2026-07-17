import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Theme = typeof Colors.light;

type FeaturedPrompt = {
  id: string;
  title: string;
  answer: string;
  eyebrow: string;
  meta: string | null;
  promptType: string;
};

type Props = {
  theme: Theme;
  featuredPrompt: FeaturedPrompt | null;
  promptsLoading: boolean;
  deletingPromptId: string | null;
  onEditPrompt: (promptType: string) => void;
  onDeletePrompt: (promptId: string) => void;
  onAddPrompt: () => void;
};

export default function MeFeaturedPromptSection({
  theme,
  featuredPrompt,
  promptsLoading,
  deletingPromptId,
  onEditPrompt,
  onDeletePrompt,
  onAddPrompt,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!featuredPrompt && promptsLoading) {
    return null;
  }

  if (!featuredPrompt) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.tint }]}>Add your voice</Text>
        <Text style={[styles.title, { color: theme.text }]}>
          One good prompt makes the profile memorable.
        </Text>
        <Text style={[styles.answer, { color: theme.textMuted }]}>
          Share a thought, a value, or a line that feels unmistakably like you.
        </Text>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: theme.tint }]}
          onPress={onAddPrompt}
        >
          <Text style={styles.ctaText}>Answer a prompt</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDeleting = deletingPromptId === featuredPrompt.id;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.tint }]}>
          {featuredPrompt.eyebrow}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: theme.outline }]}
            onPress={() => onEditPrompt(featuredPrompt.promptType)}
          >
            <MaterialCommunityIcons name="pencil" size={14} color={theme.tint} />
            <Text style={[styles.actionText, { color: theme.tint }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.removeButton, { borderColor: theme.outline }]}
            onPress={() => onDeletePrompt(featuredPrompt.id)}
            disabled={isDeleting}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={14}
              color={theme.textMuted}
            />
            <Text style={[styles.removeText, { color: theme.textMuted }]}>
              {isDeleting ? "Removing" : "Remove"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{featuredPrompt.title}</Text>
      {featuredPrompt.meta ? (
        <Text style={[styles.metaText, { color: theme.textMuted }]}>
          {featuredPrompt.meta}
        </Text>
      ) : null}
      <Text style={[styles.answer, { color: theme.text }]}>
        {featuredPrompt.answer}
      </Text>
    </View>
  );
}

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    card: {
      marginTop: 12,
      width: "100%",
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 8,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    eyebrow: {
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    title: {
      fontSize: 17,
      fontFamily: "PlayfairDisplay_600SemiBold",
      lineHeight: 22,
    },
    metaText: {
      marginTop: 6,
      fontSize: 11.5,
      fontFamily: "Manrope_500Medium",
      lineHeight: 16,
      letterSpacing: 0.2,
    },
    answer: {
      marginTop: 8,
      fontSize: 14,
      fontFamily: "Manrope_500Medium",
      lineHeight: 22,
      letterSpacing: 0.15,
    },
    cta: {
      alignSelf: "flex-start",
      marginTop: 14,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    ctaText: {
      color: "#fff",
      fontSize: 13,
      fontFamily: "Manrope_700Bold",
      letterSpacing: 0.2,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    actionText: {
      fontSize: 12,
      fontFamily: "Manrope_600SemiBold",
      letterSpacing: 0.2,
    },
    removeButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    removeText: {
      fontSize: 12,
      fontFamily: "Manrope_600SemiBold",
      letterSpacing: 0.2,
    },
  });
}
