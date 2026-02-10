const emoji = (...codes: number[]) => String.fromCodePoint(...codes);

export const getInterestEmoji = (interest: string): string => {
  const emojiMap: Record<string, string> = {
    Music: emoji(0x1f3b5),
    Travel: emoji(0x2708),
    Food: emoji(0x1f354),
    Dancing: emoji(0x1f483),
    Movies: emoji(0x1f3ac),
    Art: emoji(0x1f3a8),
    Reading: emoji(0x1f4da),
    Sports: emoji(0x26bd),
    Gaming: emoji(0x1f3ae),
    Cooking: emoji(0x1f373),
    Photography: emoji(0x1f4f7),
    Fitness: emoji(0x1f4aa),
    Nature: emoji(0x1f33f),
    Technology: emoji(0x1f4bb),
    Fashion: emoji(0x1f457),
    Writing: emoji(0x270d),
    Singing: emoji(0x1f3a4),
    Comedy: emoji(0x1f602),
    Business: emoji(0x1f4bc),
    Volunteering: emoji(0x1f91d),
    Learning: emoji(0x1f4d6),
    Socializing: emoji(0x1f37b),
    Adventure: emoji(0x1f9ed),
    Relaxing: emoji(0x1f9d8),
  };
  return emojiMap[interest] || emoji(0x2728);
};
