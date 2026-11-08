export type ChatEmojiGroup = {
  id: string;
  label: string;
  icon: string;
  emojis: readonly string[];
};

export const CHAT_EMOJI_GROUPS: readonly ChatEmojiGroup[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '\u{1F60A}',
    emojis: ['\u{1F600}', '\u{1F603}', '\u{1F604}', '\u{1F601}', '\u{1F606}', '\u{1F605}', '\u{1F602}', '\u{1F923}', '\u{1F60A}', '\u{1F607}', '\u{1F642}', '\u{1F643}', '\u{1FAE0}', '\u{1F609}', '\u{1F60C}', '\u{1F60D}', '\u{1F970}', '\u{1F618}', '\u{1F617}', '\u{1F61A}', '\u{1F60B}', '\u{1F61B}', '\u{1F92A}', '\u{1F92D}'],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    icon: '\u{1F44B}',
    emojis: ['\u{1F44B}', '\u{1F91A}', '\u{1F590}\uFE0F', '\u270B', '\u{1F596}', '\u{1FAF6}', '\u{1F44C}', '\u{1F90C}', '\u{1F90F}', '\u270C\uFE0F', '\u{1F91E}', '\u{1FAF0}', '\u{1F91F}', '\u{1F918}', '\u{1F919}', '\u{1F448}', '\u{1F449}', '\u{1F446}', '\u{1F447}', '\u{1F44D}', '\u{1F44F}', '\u{1F64C}', '\u{1F64F}', '\u{1F4AA}'],
  },
  {
    id: 'hearts',
    label: 'Love',
    icon: '\u2764\uFE0F',
    emojis: ['\u2764\uFE0F', '\u{1F9E1}', '\u{1F49B}', '\u{1F49A}', '\u{1FA75}', '\u{1F499}', '\u{1F49C}', '\u{1F90E}', '\u{1F5A4}', '\u{1FA76}', '\u{1F90D}', '\u{1F494}', '\u2763\uFE0F', '\u{1F495}', '\u{1F49E}', '\u{1F493}', '\u{1F497}', '\u{1F496}', '\u{1F498}', '\u{1F49D}', '\u{1F48C}', '\u{1F48B}', '\u{1F48D}', '\u{1F339}'],
  },
  {
    id: 'people',
    label: 'People',
    icon: '\u{1F9D1}',
    emojis: ['\u{1F64B}', '\u{1F64E}', '\u{1F645}', '\u{1F646}', '\u{1F481}', '\u{1F64D}', '\u{1F487}', '\u{1F486}', '\u{1F9D8}', '\u{1F9D1}', '\u{1F468}', '\u{1F469}', '\u{1F9D4}', '\u{1F475}', '\u{1F474}', '\u{1F9D1}\u200D\u{1F91D}\u200D\u{1F9D1}', '\u{1F46B}', '\u{1F46C}', '\u{1F46D}', '\u{1FAC2}', '\u{1F46A}', '\u{1FAC2}', '\u{1F483}', '\u{1F57A}'],
  },
  {
    id: 'celebration',
    label: 'Celebration',
    icon: '\u{1F389}',
    emojis: ['\u{1F389}', '\u{1F38A}', '\u{1F388}', '\u{1F381}', '\u{1F382}', '\u{1F973}', '\u{1F947}', '\u{1F3C6}', '\u{1F3AF}', '\u{1F3B5}', '\u{1F3B6}', '\u{1F3A4}', '\u{1F3A7}', '\u{1F483}', '\u{1F57A}', '\u{1F942}', '\u{1F37E}', '\u2728', '\u{1F31F}', '\u{1F525}', '\u{1F4AF}', '\u2705', '\u{1F680}', '\u{1F4AB}'],
  },
  {
    id: 'dates',
    label: 'Dates',
    icon: '\u{1F37D}\uFE0F',
    emojis: ['\u2615', '\u{1F375}', '\u{1F377}', '\u{1F378}', '\u{1F379}', '\u{1F37D}\uFE0F', '\u{1F355}', '\u{1F35D}', '\u{1F363}', '\u{1F370}', '\u{1F36B}', '\u{1F353}', '\u{1F33A}', '\u{1F337}', '\u{1F305}', '\u{1F307}', '\u{1F3A5}', '\u{1F3AD}', '\u{1F3B3}', '\u{1F3A8}', '\u{1F3D6}\uFE0F', '\u{1F30C}', '\u{1F696}', '\u{1F4CD}'],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: '\u2728',
    emojis: ['\u2728', '\u2B50', '\u{1F31F}', '\u{1F4AB}', '\u26A1', '\u{1F525}', '\u{1F308}', '\u2600\uFE0F', '\u{1F319}', '\u{1F48E}', '\u{1F381}', '\u{1F3AF}', '\u{1F4AC}', '\u{1F4AD}', '\u{1F514}', '\u{1F4CC}', '\u{1F517}', '\u267E\uFE0F', '\u{1F3B6}', '\u{1F49F}', '\u262E\uFE0F', '\u262F\uFE0F', '\u2705', '\u{1F51D}'],
  },
] as const;

export type TextSelection = { start: number; end: number };

export const insertChatEmoji = (
  text: string,
  emoji: string,
  selection: TextSelection | null | undefined,
  maxLength = 500,
) => {
  const fallback = text.length;
  const start = Math.max(0, Math.min(selection?.start ?? fallback, text.length));
  const end = Math.max(start, Math.min(selection?.end ?? start, text.length));
  const remaining = maxLength - (text.length - (end - start));
  if (remaining <= 0) return { text, selection: { start, end } };
  // Never split a surrogate pair or joined emoji sequence at the message cap.
  if (emoji.length > remaining) return { text, selection: { start, end } };
  const insertion = emoji;
  const nextText = `${text.slice(0, start)}${insertion}${text.slice(end)}`;
  const cursor = start + insertion.length;
  return { text: nextText, selection: { start: cursor, end: cursor } };
};

export const filterChatEmojis = (query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return CHAT_EMOJI_GROUPS;
  return CHAT_EMOJI_GROUPS.filter((group) => (
    group.label.toLowerCase().includes(normalized)
    || group.id.includes(normalized)
  ));
};
