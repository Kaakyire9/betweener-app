const normalizeInterest = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const ICON_RULES: { pattern: RegExp; icon: string }[] = [
  { pattern: /\b(music|song|playlist|singing|dance|concert|piano|guitar|afrobeats|jazz|choir)\b/, icon: "music-note" },
  { pattern: /\b(movie|movies|film|cinema|netflix|series|theatre|theater|drama)\b/, icon: "movie-open-outline" },
  { pattern: /\b(fashion|style|styling|clothes|clothing|outfit|beauty|makeup|skincare|design)\b/, icon: "tshirt-crew-outline" },
  { pattern: /\b(travel|trip|tour|beach|flight|city|explore|adventure|passport)\b/, icon: "airplane" },
  { pattern: /\b(food|cooking|cook|dinner|brunch|coffee|restaurant|baking|chef)\b/, icon: "silverware-fork-knife" },
  { pattern: /\b(fitness|gym|workout|run|running|sport|sports|football|soccer|basketball|yoga)\b/, icon: "dumbbell" },
  { pattern: /\b(book|books|reading|poetry|writing|writer|literature|novel)\b/, icon: "book-open-page-variant-outline" },
  { pattern: /\b(art|artist|painting|drawing|gallery|creative|photography|photo|camera)\b/, icon: "palette-outline" },
  { pattern: /\b(faith|church|christian|muslim|islam|religion|spiritual|prayer)\b/, icon: "hands-pray" },
  { pattern: /\b(tech|technology|coding|software|startup|ai|business|entrepreneur)\b/, icon: "laptop" },
  { pattern: /\b(family|kids|children|parenting|home)\b/, icon: "home-heart" },
  { pattern: /\b(nature|hiking|garden|plants|outdoors|camping)\b/, icon: "leaf" },
  { pattern: /\b(game|gaming|games|chess|console)\b/, icon: "gamepad-variant-outline" },
];

export function getInterestIconName(label?: string | null) {
  const normalized = normalizeInterest(label);
  const match = ICON_RULES.find((rule) => rule.pattern.test(normalized));
  return match?.icon ?? "tag-outline";
}
