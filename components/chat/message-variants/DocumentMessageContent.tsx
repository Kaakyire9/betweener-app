import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { MessageType } from "@/components/chat/types";
import type { ChatMessageStyles } from "@/components/chat/message-variants/shared";
import { withAlpha } from "@/components/chat/message-variants/shared";

type DocumentMessageContentProps = {
  item: MessageType;
  isMyMessage: boolean;
  styles: ChatMessageStyles;
  theme: typeof Colors.light;
};

const DocumentMessageContent = memo(
  ({
    item,
    isMyMessage,
    styles,
    theme,
  }: DocumentMessageContentProps) => {
    const documentMeta = useMemo(() => {
      if (item.type !== 'document') return null;
      const parts = [item.document?.sizeLabel, item.document?.typeLabel].filter(Boolean);
      return parts.length ? parts.join(' | ') : null;
    }, [item.document?.sizeLabel, item.document?.typeLabel, item.type]);

    if (item.type !== 'document') return null;

    return (
      <View
        style={[
          styles.documentMessageContainer,
          isMyMessage ? styles.documentMessageSurfaceMy : styles.documentMessageSurfaceTheir,
        ]}
      >
        <View
          style={[
            styles.documentIcon,
            { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.2) : withAlpha(theme.tint, 0.15) },
          ]}
        >
          <MaterialCommunityIcons
            name="file-document-outline"
            size={18}
            color={isMyMessage ? Colors.light.background : theme.tint}
          />
        </View>
        <View style={styles.documentInfo}>
          <Text
            style={[
              styles.documentName,
              { color: isMyMessage ? Colors.light.background : theme.text },
            ]}
            numberOfLines={1}
          >
            {item.document?.name || 'Document'}
          </Text>
          <View
            style={[
              styles.documentMetaPill,
              isMyMessage ? styles.documentMetaPillMy : styles.documentMetaPillTheir,
            ]}
          >
            <Text style={[styles.documentHint, { color: isMyMessage ? withAlpha(Colors.light.background, 0.78) : theme.textMuted }]}>
              {documentMeta || 'Tap to open'}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color={isMyMessage ? withAlpha(Colors.light.background, 0.76) : theme.textMuted}
        />
      </View>
    );
  },
);

DocumentMessageContent.displayName = "DocumentMessageContent";

export default DocumentMessageContent;
