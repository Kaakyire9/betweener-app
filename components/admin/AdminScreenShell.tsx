import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type AdminCapability, getRuntimeEnvironmentLabel, useAdminAccess } from '@/lib/admin/admin-access';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { type ReactNode, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle: string;
  capability?: AdminCapability;
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export const AdminScreenShell = ({
  title,
  subtitle,
  capability = 'overview',
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
}: Props) => {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const styles = useMemo(() => createStyles(theme, resolvedScheme === 'dark'), [theme, resolvedScheme]);
  const access = useAdminAccess();
  const environment = getRuntimeEnvironmentLabel();

  if (access.loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={theme.tint} />
          <Text style={styles.loadingText}>Confirming secure access…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!access.isAdmin || !access.can(capability)) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const body = (
    <>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back"
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {onRefresh ? (
          <TouchableOpacity
            accessibilityLabel={`Refresh ${title}`}
            disabled={refreshing}
            style={styles.backButton}
            onPress={onRefresh}
          >
            <MaterialCommunityIcons name="refresh" size={20} color={theme.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      <View style={styles.contextRow}>
        <View style={[styles.environmentBadge, environment === 'PRODUCTION' && styles.productionBadge]}>
          <View style={[styles.environmentDot, environment === 'PRODUCTION' && styles.productionDot]} />
          <Text style={styles.environmentText}>{environment}</Text>
        </View>
        <Text style={styles.roleText}>{String(access.role).replace('_', ' ')}</Text>
      </View>
      {children}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        <View style={styles.staticContent}>{body}</View>
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 32, gap: 14 },
    staticContent: { flex: 1, paddingHorizontal: 18, paddingTop: 8, gap: 14 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)',
      borderWidth: 1,
      borderColor: theme.outline,
    },
    headerCopy: { flex: 1, gap: 2 },
    title: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 25 },
    subtitle: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 17 },
    headerSpacer: { width: 42 },
    contextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    environmentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,128,128,0.10)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.32)' : 'rgba(0,128,128,0.24)',
    },
    productionBadge: { backgroundColor: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.28)' },
    environmentDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.tint },
    productionDot: { backgroundColor: theme.danger },
    environmentText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 0.8 },
    roleText: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 11, textTransform: 'capitalize' },
  });
