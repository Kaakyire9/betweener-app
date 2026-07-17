import type { ImageSourcePropType } from "react-native";

export type GiftArtworkAsset = {
  source: ImageSourcePropType;
  scale: number;
};

export const getGiftArtworkAsset = (
  giftType?: string | null,
): GiftArtworkAsset | null => {
  switch (giftType) {
    case "rose":
      return {
        source: require("../../assets/images/gifts/gift-rose-premium.png"),
        scale: 0.92,
      };
    case "teddy":
      return {
        source: require("../../assets/images/gifts/gift-teddy-premium.png"),
        scale: 0.84,
      };
    case "ring":
      return {
        source: require("../../assets/images/gifts/gift-ring-premium.png"),
        scale: 0.78,
      };
    default:
      return null;
  }
};
