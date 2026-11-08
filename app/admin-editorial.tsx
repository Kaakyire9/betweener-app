import { AdminScreenShell } from '@/components/admin/AdminScreenShell';
import { Colors } from '@/constants/theme';
import { RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED } from '@/features/relationship-gists/config/relationship-gist-editorial-v2-flags';
import { RelationshipGistEditorialV2Workspace } from '@/features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import {
  DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS,
  normalizeRelationshipGistEditorialPermissions,
} from '@/features/relationship-gists/editorial/relationship-gist-editorial-permissions';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Gist = {
  id: string;
  title: string;
  short_body: string | null;
  body: string;
  perspective: string;
  status: string;
  published_at: string | null;
  updated_at: string;
};

const PERSPECTIVES = ['general', 'christian', 'muslim', 'culture', 'safety', 'communication'] as const;

export default function AdminEditorialScreen() {
  return RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED
    ? <RelationshipGistEditorialV2Workspace />
    : <LegacyAdminEditorialScreen />;
}

function LegacyAdminEditorialScreen() {
  const { user, profile } = useAuth();
  const { profileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const styles = useMemo(() => createStyles(theme, resolvedScheme === 'dark'), [theme, resolvedScheme]);
  const [gists, setGists] = useState<Gist[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [perspective, setPerspective] = useState<(typeof PERSPECTIVES)[number]>('general');
  const [permissions, setPermissions] = useState(DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: permissionRows, error: permissionsError } = await supabase.rpc(
      'rpc_get_my_relationship_gist_editorial_permissions',
    );
    if (permissionsError) {
      setLoading(false);
      setPermissions(DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS);
      Alert.alert('Editorial access', 'Editorial permissions could not be verified. Access remains read-only.');
      return;
    }
    const nextPermissions = normalizeRelationshipGistEditorialPermissions(permissionRows);
    setPermissions(nextPermissions);
    if (!nextPermissions.canRead) {
      setLoading(false);
      setGists([]);
      return;
    }
    const { data, error } = await supabase.rpc('rpc_admin_get_relationship_gists');
    setLoading(false);
    if (error) {
      Alert.alert('Editorial', error.message || 'Unable to load Relationship Gists.');
      return;
    }
    setGists((data ?? []) as Gist[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingId(null);
    setTitle('');
    setSummary('');
    setBody('');
    setPerspective('general');
  }, []);

  const edit = useCallback((gist?: Gist) => {
    setEditingId(gist?.id ?? null);
    setTitle(gist?.title ?? '');
    setSummary(gist?.short_body ?? '');
    setBody(gist?.body ?? '');
    const nextPerspective = String(gist?.perspective ?? 'general').toLowerCase();
    setPerspective(PERSPECTIVES.includes(nextPerspective as any) ? nextPerspective as (typeof PERSPECTIVES)[number] : 'general');
    setEditorOpen(true);
  }, []);

  const save = useCallback(async (status: 'draft' | 'published') => {
    if (!profileId) return;
    if (status === 'draft' && !permissions.canDraft) return;
    if (status === 'published' && !permissions.canPublish) return;
    if (title.trim().length < 3 || body.trim().length < 20) {
      Alert.alert('Relationship Gist', 'Add a clear title and at least 20 characters of guidance.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('rpc_upsert_relationship_gist_editorial', {
      p_gist_id: editingId ?? undefined,
      p_actor_profile_id: profileId,
      p_title: title.trim(),
      p_short_body: summary.trim() || undefined,
      p_body: body.trim(),
      p_perspective: perspective,
      p_status: status,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    closeEditor();
    await load();
  }, [body, closeEditor, editingId, load, permissions.canDraft, permissions.canPublish, perspective, profileId, summary, title]);

  const archive = useCallback(() => {
    if (!editingId || !profileId || !permissions.canArchive) return;
    Alert.alert('Archive Gist', 'Remove this Gist from the editorial flow?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => {
        void (async () => {
          setSaving(true);
          const { error } = await supabase.rpc('rpc_archive_relationship_gist_editorial', { p_gist_id: editingId, p_actor_profile_id: profileId });
          setSaving(false);
          if (error) return Alert.alert('Archive failed', error.message);
          closeEditor();
          await load();
        })();
      } },
    ]);
  }, [closeEditor, editingId, load, permissions.canArchive, profileId]);

  return (
    <AdminScreenShell title="Editorial" subtitle="Global Relationship Gists, separated from creator submissions." capability="editorial" refreshing={loading} onRefresh={() => void load()}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>RELATIONSHIP EDITORIAL</Text>
          <Text style={styles.heroTitle}>Guidance worth standing behind.</Text>
          <Text style={styles.heroBody}>Draft privately. Publish globally only when the piece is ready.</Text>
        </View>
        {permissions.canDraft ? (
          <TouchableOpacity style={styles.newButton} onPress={() => edit()}>
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.newButtonText}>New Gist</Text>
          </TouchableOpacity>
        ) : null}
        {permissions.canSafetyReview && !permissions.canDraft ? (
          <Text style={styles.permissionNote}>Safety review access is read-only in this foundation milestone.</Text>
        ) : null}
      </View>

      {gists.length ? gists.map((gist) => (
        <Pressable key={gist.id} style={styles.card} onPress={() => edit(gist)}>
          <View style={styles.cardTop}>
            <Text style={styles.perspective}>{gist.perspective}</Text>
            <View style={[styles.status, gist.status === 'published' && styles.published]}>
              <Text style={styles.statusText}>{gist.status}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle}>{gist.title}</Text>
          <Text style={styles.cardBody} numberOfLines={3}>{gist.short_body || gist.body}</Text>
          <Text style={styles.cardMeta}>Updated {new Date(gist.updated_at).toLocaleDateString()}</Text>
        </Pressable>
      )) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="book-open-page-variant-outline" size={28} color={theme.accent} />
          <Text style={styles.emptyTitle}>No editorial Gists yet</Text>
          <Text style={styles.emptyBody}>Create the first draft when you have guidance ready to shape.</Text>
        </View>
      )}

      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={closeEditor}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditor} />
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{permissions.canDraft ? (editingId ? 'Edit Relationship Gist' : 'New Relationship Gist') : 'Review Relationship Gist'}</Text>
              <TextInput editable={permissions.canDraft} value={title} onChangeText={setTitle} maxLength={140} placeholder="Title" placeholderTextColor={theme.textMuted} style={styles.input} />
              <TextInput editable={permissions.canDraft} value={summary} onChangeText={setSummary} maxLength={420} placeholder="Card summary" placeholderTextColor={theme.textMuted} style={styles.input} />
              <TextInput editable={permissions.canDraft} value={body} onChangeText={setBody} maxLength={5000} multiline placeholder="Full guidance" placeholderTextColor={theme.textMuted} style={[styles.input, styles.bodyInput]} />
              <View style={styles.perspectiveRow}>
                {PERSPECTIVES.map((item) => (
                  <Pressable disabled={!permissions.canDraft} key={item} style={[styles.perspectiveButton, perspective === item && styles.perspectiveButtonActive]} onPress={() => setPerspective(item)}>
                    <Text style={[styles.perspectiveButtonText, perspective === item && styles.perspectiveButtonTextActive]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actions}>
                {editingId && permissions.canArchive ? <TouchableOpacity disabled={saving} style={styles.archiveButton} onPress={archive}><Text style={styles.archiveText}>Archive</Text></TouchableOpacity> : null}
                {permissions.canDraft ? <TouchableOpacity disabled={saving} style={styles.secondaryButton} onPress={() => void save('draft')}><Text style={styles.secondaryText}>Save draft</Text></TouchableOpacity> : null}
                {permissions.canPublish ? <TouchableOpacity disabled={saving} style={styles.primaryButton} onPress={() => void save('published')}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Publish'}</Text></TouchableOpacity> : null}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AdminScreenShell>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  hero: { gap: 14, padding: 18, borderRadius: 24, backgroundColor: isDark ? 'rgba(125,91,166,0.12)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(155,124,200,0.24)' : 'rgba(125,91,166,0.16)' },
  heroCopy: { gap: 5 },
  eyebrow: { color: theme.accent, fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1.4 },
  heroTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24 },
  heroBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  newButton: { alignSelf: 'flex-start', minHeight: 42, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.accent },
  newButtonText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 12 },
  permissionNote: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 11, lineHeight: 17 },
  card: { gap: 8, padding: 17, borderRadius: 22, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: theme.outline },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perspective: { color: theme.accent, fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  status: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.outline },
  published: { backgroundColor: isDark ? 'rgba(0,160,160,0.13)' : 'rgba(0,128,128,0.10)' },
  statusText: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 9, textTransform: 'capitalize' },
  cardTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20 },
  cardBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  cardMeta: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  empty: { alignItems: 'center', padding: 28, gap: 7, borderRadius: 22, borderWidth: 1, borderColor: theme.outline },
  emptyTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20 },
  emptyBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.66)' },
  modalCard: { maxHeight: '88%', borderRadius: 24, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline },
  modalContent: { padding: 20, gap: 12 },
  modalTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24 },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 15, color: theme.text, backgroundColor: theme.backgroundSubtle, borderWidth: 1, borderColor: theme.outline, fontFamily: 'Manrope_500Medium' },
  bodyInput: { minHeight: 160, textAlignVertical: 'top' },
  perspectiveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  perspectiveButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: theme.outline },
  perspectiveButtonActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  perspectiveButtonText: { color: theme.textMuted, fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'capitalize' },
  perspectiveButtonTextActive: { color: '#FFFFFF' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  primaryButton: { minHeight: 42, paddingHorizontal: 17, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint },
  primaryText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 12 },
  secondaryButton: { minHeight: 42, paddingHorizontal: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline },
  secondaryText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  archiveButton: { minHeight: 42, paddingHorizontal: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(220,38,38,0.10)' },
  archiveText: { color: theme.danger, fontFamily: 'Archivo_700Bold', fontSize: 12 },
});
