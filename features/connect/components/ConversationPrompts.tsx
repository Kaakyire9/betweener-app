import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
const prompts = ['What made you smile today?', 'What feels like home to you?', 'What would your ideal relaxed weekend look like?'];
/** Optional, local prompts. No transcription, answers, analytics or transmission. */
export function ConversationPrompts() {
  const [index, setIndex] = useState<number | null>(null);
  return <View style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityLabel={index === null ? 'Show a conversation prompt' : 'Show another conversation prompt'}
      style={styles.button} onPress={() => setIndex(index === null ? 0 : (index + 1) % prompts.length)}><Text style={styles.link}>{index === null ? 'Need an icebreaker?' : 'Another icebreaker'}</Text></Pressable>
    {index !== null && <><Text style={styles.prompt}>{prompts[index]}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Hide conversation prompt" style={styles.button} onPress={() => setIndex(null)}><Text style={styles.link}>Hide</Text></Pressable></>}
  </View>;
}
const styles = StyleSheet.create({ root: { width: '100%', alignItems: 'center', gap: 6 }, button: { minHeight: 44, padding: 10, justifyContent: 'center' },
  link: { color: Colors.dark.secondary, fontSize: 13 }, prompt: { color: Colors.dark.text, textAlign: 'center', fontSize: 16, lineHeight: 24 } });
