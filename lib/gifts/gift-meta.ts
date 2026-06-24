import { MaterialCommunityIcons } from "@expo/vector-icons";

export type GiftMeta = {
  label: string;
  sentence: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tint: string;
  glow: string;
  gradient: [string, string, string];
  accent: string;
  emoji: string;
  hero: {
    auraSize: number;
    haloSize: number;
    pedestalSize: number;
    artworkSize: number;
  };
  motion: {
    floatOffset: number;
    floatDuration: number;
    glowDuration: number;
    orbitDuration: number;
  };
};

export const getGiftMeta = (giftType?: string | null): GiftMeta => {
  switch (giftType) {
    case "rose":
      return {
        label: "Rose",
        sentence: "a rose",
        icon: "flower-tulip-outline",
        tint: "#FB7185",
        glow: "rgba(251, 113, 133, 0.34)",
        gradient: ["#4B1329", "#B03359", "#FFD6DE"],
        accent: "#FFE6EB",
        emoji: "🌹",
        hero: {
          auraSize: 230,
          haloSize: 262,
          pedestalSize: 226,
          artworkSize: 236,
        },
        motion: {
          floatOffset: 4,
          floatDuration: 3800,
          glowDuration: 4400,
          orbitDuration: 5200,
        },
      };
    case "teddy":
      return {
        label: "Teddy Bear",
        sentence: "a teddy bear",
        icon: "teddy-bear",
        tint: "#F59E0B",
        glow: "rgba(245, 158, 11, 0.32)",
        gradient: ["#4A2A0A", "#C47B1A", "#F9DFC0"],
        accent: "#FFF1DB",
        emoji: "🧸",
        hero: {
          auraSize: 238,
          haloSize: 268,
          pedestalSize: 232,
          artworkSize: 228,
        },
        motion: {
          floatOffset: 3,
          floatDuration: 4600,
          glowDuration: 5200,
          orbitDuration: 6200,
        },
      };
    case "ring":
      return {
        label: "Ring",
        sentence: "a ring",
        icon: "diamond-stone",
        tint: "#C4B5FD",
        glow: "rgba(196, 181, 253, 0.32)",
        gradient: ["#24143D", "#6B57D9", "#E8E2FF"],
        accent: "#F3F0FF",
        emoji: "💍",
        hero: {
          auraSize: 224,
          haloSize: 256,
          pedestalSize: 220,
          artworkSize: 218,
        },
        motion: {
          floatOffset: 2,
          floatDuration: 5000,
          glowDuration: 4000,
          orbitDuration: 4200,
        },
      };
    default:
      return {
        label: "Gift",
        sentence: "a gift",
        icon: "gift-outline",
        tint: "#2ED6C2",
        glow: "rgba(46, 214, 194, 0.28)",
        gradient: ["#10353B", "#118E99", "#DDFDFC"],
        accent: "#F2FFFE",
        emoji: "🎁",
        hero: {
          auraSize: 220,
          haloSize: 256,
          pedestalSize: 220,
          artworkSize: 228,
        },
        motion: {
          floatOffset: 3,
          floatDuration: 4200,
          glowDuration: 4600,
          orbitDuration: 5600,
        },
      };
  }
};
