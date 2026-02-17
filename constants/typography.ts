import { Platform, type TextStyle } from "react-native";

// Font family names must match the keys used in `constants/fonts.ts` useFonts() calls.
// These will gracefully fall back to the platform font when fonts haven't loaded yet.
export const FontFamilies = {
  brand: Platform.select({ default: "Archivo_700Bold" as const, web: "Archivo_700Bold" as const }),
  displayBold: Platform.select({
    default: "PlayfairDisplay_700Bold" as const,
    web: "PlayfairDisplay_700Bold" as const,
  }),
  displaySemi: Platform.select({
    default: "PlayfairDisplay_600SemiBold" as const,
    web: "PlayfairDisplay_600SemiBold" as const,
  }),
  body: Platform.select({ default: "Manrope_400Regular" as const, web: "Manrope_400Regular" as const }),
  bodyMedium: Platform.select({
    default: "Manrope_500Medium" as const,
    web: "Manrope_500Medium" as const,
  }),
  bodySemi: Platform.select({
    default: "Manrope_600SemiBold" as const,
    web: "Manrope_600SemiBold" as const,
  }),
  bodyBold: Platform.select({ default: "Manrope_700Bold" as const, web: "Manrope_700Bold" as const }),
};

export type TextVariant =
  | "h1"
  | "h2"
  | "h3"
  | "body"
  | "bodyStrong"
  | "caption"
  | "button"
  | "pill";

export const textVariantStyle = (variant: TextVariant): TextStyle => {
  switch (variant) {
    case "h1":
      return { fontFamily: FontFamilies.displayBold, fontSize: 34, lineHeight: 40, letterSpacing: 0.2 };
    case "h2":
      return { fontFamily: FontFamilies.displaySemi, fontSize: 26, lineHeight: 32, letterSpacing: 0.1 };
    case "h3":
      return { fontFamily: FontFamilies.bodyBold, fontSize: 18, lineHeight: 24, letterSpacing: 0.1 };
    case "bodyStrong":
      return { fontFamily: FontFamilies.bodySemi, fontSize: 16, lineHeight: 22 };
    case "caption":
      return { fontFamily: FontFamilies.bodyMedium, fontSize: 12, lineHeight: 16 };
    case "button":
      return { fontFamily: FontFamilies.bodyBold, fontSize: 16, lineHeight: 20, letterSpacing: 0.2 };
    case "pill":
      return { fontFamily: FontFamilies.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 };
    case "body":
    default:
      return { fontFamily: FontFamilies.body, fontSize: 16, lineHeight: 22 };
  }
};

