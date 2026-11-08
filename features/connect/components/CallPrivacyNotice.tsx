import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Colors } from '@/constants/theme';
/** The server-pinned call mode is distinct from a confirmed encrypted join. */
export function CallPrivacyNotice({ required = false }: { required?: boolean }) {
  return <Text accessibilityLabel="Staging call privacy" style={styles.note}>{required ? 'End-to-end encryption required · Compare safety codes after connecting.' : 'Staging call · End-to-end encryption isn’t enabled.'}</Text>;
}
const styles = StyleSheet.create({ note: { color: Colors.dark.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 18, paddingHorizontal: 12 } });
