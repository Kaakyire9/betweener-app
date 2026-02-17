import { textVariantStyle, type TextVariant } from "@/constants/typography";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import type { TextProps, TextStyle } from "react-native";
import { Text } from "react-native";

type Props = TextProps & {
  variant?: TextVariant;
  muted?: boolean;
  style?: TextStyle | TextStyle[];
};

export default function AppText({ variant = "body", muted = false, style, ...rest }: Props) {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? "light"];
  return (
    <Text
      {...rest}
      style={[
        textVariantStyle(variant),
        { color: muted ? theme.textMuted : theme.text },
        style as any,
      ]}
    />
  );
}

