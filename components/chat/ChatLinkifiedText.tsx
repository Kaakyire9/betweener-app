import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { extractChatLinks } from '@/lib/chat/links/chat-link-policy';

type ChatLinkifiedTextProps = {
  text: string;
  style: StyleProp<TextStyle>;
  linkStyle: StyleProp<TextStyle>;
  highlightQuery?: string;
  highlightStyle?: StyleProp<TextStyle>;
  onHighlightPress?: () => void;
  onOpenLink: (url: string) => void;
};

export default function ChatLinkifiedText({
  text,
  style,
  linkStyle,
  highlightQuery,
  highlightStyle,
  onHighlightPress,
  onOpenLink,
}: ChatLinkifiedTextProps) {
  const nodes = useMemo<ReactNode[]>(() => {
    const query = highlightQuery?.trim();
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'ig');
      const parts = text.split(regex);
      const matches = text.match(regex);
      if (!matches) return [text];
      return parts.flatMap((part, index) => {
        const match = matches[index];
        return [
          part,
          match ? (
            <Text
              key={`highlight-${index}`}
              style={highlightStyle}
              onPress={onHighlightPress}
            >
              {match}
            </Text>
          ) : null,
        ];
      });
    }

    const links = extractChatLinks(text);
    if (links.length === 0) return [text];
    const output: ReactNode[] = [];
    let cursor = 0;
    links.forEach((link, index) => {
      if (link.start > cursor) output.push(text.slice(cursor, link.start));
      output.push(
        <Text
          key={`${link.normalizedUrl}-${index}`}
          accessibilityRole="link"
          accessibilityLabel={`Open ${link.host}`}
          style={linkStyle}
          onPress={(event) => {
            event.stopPropagation();
            onOpenLink(link.normalizedUrl);
          }}
        >
          {link.displayText}
        </Text>,
      );
      cursor = link.end;
    });
    if (cursor < text.length) output.push(text.slice(cursor));
    return output;
  }, [highlightQuery, highlightStyle, onHighlightPress, onOpenLink, linkStyle, text]);

  return <Text style={style}>{nodes}</Text>;
}
