import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useJournalStore } from './journal-context';
import { useJournalTheme } from './JournalPrimitives';
import { withAlpha } from '@/lib/chat/ui/color-utils';
export function JournalShortcut() {
  const store = useJournalStore(), router = useRouter(), { colors } = useJournalTheme();
  if (!store?.current()) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Open Connection Journal call history" onPress={() => router.push('/connect')}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 12, padding: 13, minHeight: 64, borderRadius: 20, borderWidth: 1, borderColor: withAlpha(colors.tint, .15), backgroundColor: withAlpha(colors.tint, .04) }}>
    <Ionicons name="call-outline" size={20} color={colors.tint} accessible={false} /><View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 13 }}>Connection Journal</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>Every call has a story.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} accessible={false} />
  </Pressable>;
}
