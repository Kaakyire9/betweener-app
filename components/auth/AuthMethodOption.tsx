import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AUTH_PALETTE } from '@/components/auth/AuthScreenFrame';
import type { LastSignInMethod } from '@/lib/auth/last-sign-in-method';

const METHOD_ICONS: Record<LastSignInMethod, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  google: 'google',
  apple: 'apple',
  email_link: 'email-outline',
  password: 'lock-outline',
};

export function AuthMethodIcon({
  method,
  color = AUTH_PALETTE.teal,
  size = 20,
}: {
  method: LastSignInMethod;
  color?: string;
  size?: number;
}) {
  return <MaterialCommunityIcons name={METHOD_ICONS[method]} size={size} color={color} />;
}

export function AuthMethodOption({
  method,
  title,
  subtitle,
  onPress,
  trailing,
  disabled = false,
}: {
  method: LastSignInMethod;
  title: string;
  subtitle?: string;
  onPress: () => void;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.iconShell}>
        <AuthMethodIcon method={method} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ?? (
        <MaterialCommunityIcons name="chevron-right" size={21} color={AUTH_PALETTE.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(95,112,108,0.14)',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  rowPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.992 }],
  },
  disabled: { opacity: 0.48 },
  iconShell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: AUTH_PALETTE.softTeal,
  },
  copy: { flex: 1 },
  title: {
    color: AUTH_PALETTE.ink,
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
  },
  subtitle: {
    marginTop: 3,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
  },
});
