import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import type { MessageType } from "@/components/chat/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";

type Theme = {
  textMuted: string;
};

type ReactionProfileMap = Record<string, { name: string; avatar?: string | null }>;

type Props = {
  visible: boolean;
  styles: Record<string, any>;
  theme: Theme;
  isDark: boolean;
  currentUserId?: string | null;
  currentUserAvatarUrl?: string | null;
  reactionSheetMessage: MessageType | null;
  reactionSummary: Array<{ emoji: string; count: number }>;
  reactionSheetList: Array<{ userId: string; emoji: string }>;
  reactionSheetEmoji: string | null;
  reactionProfiles: ReactionProfileMap;
  reactionProfilesLoading: boolean;
  fallbackAvatarSource: any;
  onClose: () => void;
  onSelectEmoji: (emoji: string | null) => void;
};

export default function ChatReactionSummarySheet({
  visible,
  styles,
  theme,
  isDark,
  currentUserId,
  currentUserAvatarUrl,
  reactionSheetMessage,
  reactionSummary,
  reactionSheetList,
  reactionSheetEmoji,
  reactionProfiles,
  reactionProfilesLoading,
  fallbackAvatarSource,
  onClose,
  onSelectEmoji,
}: Props) {
  if (!visible) return null;

  return (
    <>
      <Pressable
        testID="chat-reaction-sheet-backdrop"
        style={styles.reactionSheetBackdrop}
        onPress={onClose}
      />
      <View style={styles.reactionSheet}>
        <BlurViewSafe
          intensity={32}
          tint={isDark ? "dark" : "light"}
          style={styles.reactionSheetBlur}
        />
        <View style={styles.reactionSheetHeader}>
          <View>
            <Text style={styles.reactionSheetTitle}>Reactions</Text>
            <Text style={styles.reactionSheetCount}>
              {reactionSheetMessage?.reactions.length ?? 0} total
            </Text>
          </View>
          <TouchableOpacity
            testID="chat-reaction-sheet-close"
            onPress={onClose}
            style={styles.reactionSheetClose}
          >
            <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.reactionSheetPills}
        >
          <Pressable
            testID="chat-reaction-filter-all"
            style={[
              styles.reactionSheetPill,
              reactionSheetEmoji === null && styles.reactionSheetPillActive,
            ]}
            onPress={() => onSelectEmoji(null)}
          >
            <Text
              style={[
                styles.reactionSheetPillText,
                reactionSheetEmoji === null && styles.reactionSheetPillTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          {reactionSummary.map((summary, index) => (
            <Pressable
              key={summary.emoji}
              testID={`chat-reaction-filter-${index}`}
              style={[
                styles.reactionSheetPill,
                reactionSheetEmoji === summary.emoji && styles.reactionSheetPillActive,
              ]}
              onPress={() => onSelectEmoji(summary.emoji)}
            >
              <Text style={styles.reactionSheetPillEmoji}>{summary.emoji}</Text>
              <Text
                style={[
                  styles.reactionSheetPillText,
                  reactionSheetEmoji === summary.emoji && styles.reactionSheetPillTextActive,
                ]}
              >
                {summary.count}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={styles.reactionSheetList}>
          {reactionSheetMessage && reactionSheetList.length === 0 ? (
            <Text style={styles.reactionSheetEmpty}>No reactions yet.</Text>
          ) : (
            reactionSheetList.map((reaction, index) => {
              const profileEntry = reactionProfiles[reaction.userId];
              const isCurrentUser = reaction.userId === currentUserId;
              const label = isCurrentUser ? "You" : profileEntry?.name || "Unknown";
              const avatarSource = isCurrentUser ? currentUserAvatarUrl : profileEntry?.avatar;

              return (
                <View
                  key={`${reaction.userId}-${reaction.emoji}-${index}`}
                  testID={`chat-reaction-row-${index}`}
                  style={styles.reactionSheetRow}
                >
                  <Image
                    source={avatarSource ? { uri: avatarSource } : fallbackAvatarSource}
                    style={styles.reactionSheetAvatar}
                  />
                  <Text style={styles.reactionSheetName}>{label}</Text>
                  <Text style={styles.reactionSheetEmoji}>{reaction.emoji}</Text>
                </View>
              );
            })
          )}
          {reactionProfilesLoading ? (
            <Text style={styles.reactionSheetHint}>Loading profiles...</Text>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
