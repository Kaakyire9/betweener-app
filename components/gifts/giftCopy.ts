type GiftRevealCopyInput = {
  giftType?: string | null;
  senderName?: string | null;
};

const normalizeSenderName = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || "Someone";
};

export const getGiftRevealCopy = ({
  giftType,
  senderName,
}: GiftRevealCopyInput) => {
  const resolvedSender = normalizeSenderName(senderName);

  switch (giftType) {
    case "rose":
      return {
        title: `${resolvedSender} sent a rose worth opening`,
        meaning: "A warm signal of interest.",
        storyLine: "Something about your profile caught their attention.",
      };
    case "teddy":
      return {
        title: `${resolvedSender} sent a teddy worth opening`,
        meaning: "A gentle signal of warmth.",
        storyLine:
          "Your energy felt safe, inviting, and worth leaning into.",
      };
    case "ring":
      return {
        title: `${resolvedSender} sent a ring worth opening`,
        meaning: "A bold signal of serious interest.",
        storyLine: "Your story landed with unusual weight and intention.",
      };
    default:
      return {
        title: `${resolvedSender} sent a gift worth opening`,
        meaning: "A thoughtful signal of interest.",
        storyLine: "Your profile made an impression.",
      };
  }
};

export const getGiftStoryCtaLabel = (senderGender?: string | null) => {
  const normalized = String(senderGender || "").trim().toUpperCase();
  if (normalized === "FEMALE" || normalized === "WOMAN") {
    return "Open Her Story";
  }
  if (normalized === "MALE" || normalized === "MAN") {
    return "Open His Story";
  }
  return "Open Their Story";
};
