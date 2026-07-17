import { memo, useMemo } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { MessageType } from "@/components/chat/types";
import type { ChatMessageStyles } from "@/components/chat/message-variants/shared";
import { formatVoiceDuration, withAlpha } from "@/components/chat/message-variants/shared";

type VoiceMessageContentProps = {
  item: MessageType;
  isMyMessage: boolean;
  isPlaying: boolean;
  styles: ChatMessageStyles;
  theme: typeof Colors.light;
  isDark: boolean;
  onToggleVoice: (messageId: string) => void;
};

const VoiceMessageContent = memo(
  ({
    item,
    isMyMessage,
    isPlaying,
    styles,
    theme,
    isDark,
    onToggleVoice,
  }: VoiceMessageContentProps) => {
    const waveformBars = useMemo(() => {
      if (item.type !== 'voice' || !item.voiceMessage?.waveform) return null;
      return item.voiceMessage.waveform.map((height, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.waveformBar,
            {
              height: height * 20,
              backgroundColor: isPlaying
                ? (isMyMessage ? Colors.light.background : theme.tint)
                : (isMyMessage ? withAlpha(Colors.light.background, 0.62) : withAlpha(theme.text, isDark ? 0.42 : 0.28)),
            },
          ]}
        />
      ));
    }, [isDark, isMyMessage, isPlaying, item.type, item.voiceMessage?.waveform, styles.waveformBar, theme.text, theme.tint]);

    if (item.type !== 'voice') return null;

    return (
      <View style={styles.voiceMessageContainer}>
        <TouchableOpacity
          style={[
            styles.voicePlayButton,
            isMyMessage ? styles.voicePlayButtonMy : styles.voicePlayButtonTheir,
            isPlaying && (isMyMessage ? styles.voicePlayButtonMyActive : styles.voicePlayButtonTheirActive),
          ]}
          onPress={() => onToggleVoice(item.id)}
        >
          <MaterialCommunityIcons
            name={isPlaying ? 'pause' : 'play'}
            size={16}
            color={isMyMessage ? theme.tint : Colors.light.background}
          />
        </TouchableOpacity>

        <View
          style={[
            styles.voiceWaveformCard,
            isMyMessage ? styles.voiceWaveformCardMy : styles.voiceWaveformCardTheir,
            isPlaying && (isMyMessage ? styles.voiceWaveformCardMyActive : styles.voiceWaveformCardTheirActive),
          ]}
        >
          <View style={styles.voiceWaveform}>
            {waveformBars}
          </View>
          <View
            style={[
              styles.voiceDurationPill,
              isMyMessage ? styles.voiceDurationPillMy : styles.voiceDurationPillTheir,
            ]}
          >
            <Text
              style={[
                styles.voiceDuration,
                isMyMessage ? styles.voiceDurationMy : styles.voiceDurationTheir,
              ]}
            >
              {formatVoiceDuration(item.voiceMessage?.duration || 0)}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

VoiceMessageContent.displayName = "VoiceMessageContent";

export default VoiceMessageContent;
