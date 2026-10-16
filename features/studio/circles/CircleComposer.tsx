import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CIRCLE_ACCESS_OPTIONS,
  CIRCLE_REACH_OPTIONS,
  getCircleAccessOptionLabel,
  getCircleReachOptionLabel,
  toggleCircleReachScope,
  type CircleAccessPolicy,
  type CircleLiveDiscoveryPolicy,
  type CircleMembershipEligibilityPolicy,
  type CircleReachScope,
} from '@/lib/circles/circle-audience';
import { findCountryByCode, type CountryOption } from '@/lib/location/countries';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CircleCityPickerModal, CircleCountryPickerModal } from './CircleAudienceLocationPickers';

type Props = {
  visible: boolean;
  name: string;
  purpose: string;
  city: string;
  region: string;
  countryCode: string;
  countryName: string;
  reachScope: CircleReachScope;
  reachScopes: CircleReachScope[];
  accessPolicy: CircleAccessPolicy;
  diasporaOriginCountryCodes: string[];
  diasporaDestinationCountryCodes: string[];
  membershipEligibilityPolicy: CircleMembershipEligibilityPolicy;
  liveDiscoveryPolicy: CircleLiveDiscoveryPolicy;
  editing: boolean;
  editingApproved: boolean;
  saving: boolean;
  onNameChange: (value: string) => void;
  onPurposeChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onCountryChange: (code: string, name: string) => void;
  onReachScopeChange: (value: CircleReachScope) => void;
  onReachScopesChange: (value: CircleReachScope[]) => void;
  onAccessPolicyChange: (value: CircleAccessPolicy) => void;
  onDiasporaOriginCountryCodesChange: (value: string[]) => void;
  onDiasporaDestinationCountryCodesChange: (value: string[]) => void;
  onMembershipEligibilityPolicyChange: (value: CircleMembershipEligibilityPolicy) => void;
  onLiveDiscoveryPolicyChange: (value: CircleLiveDiscoveryPolicy) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function CircleComposer(props: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = createStyles(theme);
  const [countryPickerTarget, setCountryPickerTarget] = useState<'primary' | 'origin' | 'destination' | null>(null);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const hasCountryReach = props.reachScopes.includes('country');
  const hasLocalReach = props.reachScopes.includes('local');
  const hasLocationReach = hasCountryReach || hasLocalReach;
  const hasDiasporaReach = props.reachScopes.includes('diaspora');
  const submitLabel = props.saving
    ? 'Submitting'
    : props.editing
      ? props.editingApproved ? 'Save changes' : 'Save and resubmit'
      : 'Submit for review';

  const countryNames = (codes: string[]) => codes
    .map((code) => findCountryByCode(code)?.label ?? code)
    .join(', ');
  const selectedCountryCodes = countryPickerTarget === 'origin'
    ? props.diasporaOriginCountryCodes
    : countryPickerTarget === 'destination'
      ? props.diasporaDestinationCountryCodes
      : props.countryCode ? [props.countryCode] : [];
  const toggleCode = (codes: string[], code: string) => (
    codes.includes(code) ? codes.filter((item) => item !== code) : [...codes, code]
  );
  const handleCountrySelect = (country: CountryOption) => {
    if (countryPickerTarget === 'origin') {
      const next = toggleCode(props.diasporaOriginCountryCodes, country.code);
      props.onDiasporaOriginCountryCodesChange(next);
      props.onDiasporaDestinationCountryCodesChange(
        props.diasporaDestinationCountryCodes.filter((code) => !next.includes(code)),
      );
      if (!hasLocationReach) {
        const primary = findCountryByCode(next[0]);
        props.onCountryChange(primary?.code ?? '', primary?.label ?? '');
      }
      return;
    }
    if (countryPickerTarget === 'destination') {
      props.onDiasporaDestinationCountryCodesChange(
        toggleCode(props.diasporaDestinationCountryCodes, country.code)
          .filter((code) => !props.diasporaOriginCountryCodes.includes(code)),
      );
      return;
    }
    props.onCountryChange(country.code, country.label);
    props.onCityChange('');
    props.onRegionChange('');
    setCountryPickerTarget(null);
  };

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <KeyboardAvoidingView style={styles.keyboardWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.card} onPress={() => undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>{props.editing ? 'Edit Circle' : 'Create Circle'}</Text>
              <Text style={styles.subtitle}>Choose one or more discovery audiences. Access separately controls who can join.</Text>

              <Text style={styles.label}>Circle identity</Text>
              <TextInput accessibilityLabel="Circle name" value={props.name} onChangeText={props.onNameChange} placeholder="Circle name" placeholderTextColor={theme.textMuted} style={styles.input} />
              <TextInput accessibilityLabel="Circle purpose" value={props.purpose} onChangeText={props.onPurposeChange} placeholder="Purpose and who it is for" placeholderTextColor={theme.textMuted} multiline style={[styles.input, styles.multiline]} />

              <Text style={styles.label}>Reach</Text>
              <View style={styles.options}>
                {CIRCLE_REACH_OPTIONS.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: props.reachScopes.includes(item) }}
                    style={[styles.pill, props.reachScopes.includes(item) && styles.pillActive]}
                    onPress={() => {
                      const next = toggleCircleReachScope(props.reachScopes, item);
                      props.onReachScopesChange(next);
                      props.onReachScopeChange(next.find((scope) => scope !== 'diaspora') ?? next[0]);
                    }}
                  >
                    <Text style={[styles.pillText, props.reachScopes.includes(item) && styles.pillTextActive]}>{getCircleReachOptionLabel(item)}</Text>
                  </Pressable>
                ))}
              </View>

              {hasLocationReach && hasDiasporaReach ? (
                <Text style={styles.selectionHint}>Residents in this location and people from these heritage countries living abroad will discover the same Circle.</Text>
              ) : null}

              {hasLocationReach ? (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel="Choose Circle country" style={styles.selectField} onPress={() => setCountryPickerTarget('primary')}>
                    <View style={styles.selectCopy}>
                      <Text style={styles.selectLabel}>Country</Text>
                      <Text style={[styles.selectValue, !props.countryName && styles.selectPlaceholder]}>{props.countryName || 'Choose country'}</Text>
                    </View>
                    <Text style={styles.selectCode}>{props.countryCode}</Text>
                  </Pressable>
                  {hasLocalReach ? (
                    <Pressable disabled={!props.countryCode} accessibilityRole="button" accessibilityLabel="Choose Circle city" style={[styles.selectField, !props.countryCode && styles.pillDisabled]} onPress={() => setCityPickerOpen(true)}>
                      <View style={styles.selectCopy}>
                        <Text style={styles.selectLabel}>City or town</Text>
                        <Text style={[styles.selectValue, !props.city && styles.selectPlaceholder]}>{props.city || 'Choose locality'}</Text>
                        {props.region ? <Text style={styles.selectMeta}>{props.region}</Text> : null}
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.tint} />
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {hasDiasporaReach ? (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel="Choose diaspora heritage countries" style={styles.selectField} onPress={() => setCountryPickerTarget('origin')}>
                    <View style={styles.selectCopy}>
                      <Text style={styles.selectLabel}>Heritage countries</Text>
                      <Text style={[styles.selectValue, !props.diasporaOriginCountryCodes.length && styles.selectPlaceholder]}>{countryNames(props.diasporaOriginCountryCodes) || 'Choose at least one country'}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.tint} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Choose diaspora host countries" style={styles.selectField} onPress={() => setCountryPickerTarget('destination')}>
                    <View style={styles.selectCopy}>
                      <Text style={styles.selectLabel}>Host countries</Text>
                      <Text style={[styles.selectValue, !props.diasporaDestinationCountryCodes.length && styles.selectPlaceholder]}>{countryNames(props.diasporaDestinationCountryCodes) || 'Any country outside the heritage country'}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.tint} />
                  </Pressable>
                </>
              ) : null}

              <Text style={styles.label}>Access</Text>
              <View style={styles.options}>
                {CIRCLE_ACCESS_OPTIONS.map((item) => (
                  <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: props.accessPolicy === item }} style={[styles.pill, props.accessPolicy === item && styles.pillActive]} onPress={() => props.onAccessPolicyChange(item)}>
                    <Text style={[styles.pillText, props.accessPolicy === item && styles.pillTextActive]}>{getCircleAccessOptionLabel(item)}</Text>
                  </Pressable>
                ))}
              </View>

              {hasLocationReach ? (
                <Pressable accessibilityRole="switch" accessibilityState={{ checked: props.membershipEligibilityPolicy === 'target_only' }} style={styles.settingRow} onPress={() => props.onMembershipEligibilityPolicyChange(props.membershipEligibilityPolicy === 'target_only' ? 'recommend_only' : 'target_only')}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>Restrict membership to this location</Text>
                    <Text style={styles.settingBody}>Leave off to target discovery without excluding travellers or diaspora members.</Text>
                  </View>
                  <Text style={styles.settingValue}>{props.membershipEligibilityPolicy === 'target_only' ? 'On' : 'Off'}</Text>
                </Pressable>
              ) : null}

              <Text style={styles.label}>Circle Live discovery</Text>
              <View style={styles.options}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: props.liveDiscoveryPolicy === 'members_only' }} style={[styles.pill, props.liveDiscoveryPolicy === 'members_only' && styles.pillActive]} onPress={() => props.onLiveDiscoveryPolicyChange('members_only')}>
                  <Text style={[styles.pillText, props.liveDiscoveryPolicy === 'members_only' && styles.pillTextActive]}>Members only</Text>
                </Pressable>
                <Pressable disabled={props.accessPolicy === 'invite_only'} accessibilityRole="button" accessibilityState={{ selected: props.liveDiscoveryPolicy === 'discoverable_join_required', disabled: props.accessPolicy === 'invite_only' }} style={[styles.pill, props.liveDiscoveryPolicy === 'discoverable_join_required' && styles.pillActive, props.accessPolicy === 'invite_only' && styles.pillDisabled]} onPress={() => props.onLiveDiscoveryPolicyChange('discoverable_join_required')}>
                  <Text style={[styles.pillText, props.liveDiscoveryPolicy === 'discoverable_join_required' && styles.pillTextActive]}>Discoverable · join required</Text>
                </Pressable>
              </View>

              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={props.onClose}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
                <Pressable style={styles.primaryButton} disabled={props.saving} onPress={props.onSubmit}><Text style={styles.primaryText}>{submitLabel}</Text></Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
      <CircleCountryPickerModal
        visible={countryPickerTarget !== null}
        title={countryPickerTarget === 'origin' ? 'Heritage countries' : countryPickerTarget === 'destination' ? 'Host countries' : 'Circle country'}
        selectedCodes={selectedCountryCodes}
        multiple={countryPickerTarget === 'origin' || countryPickerTarget === 'destination'}
        onClose={() => setCountryPickerTarget(null)}
        onSelect={handleCountrySelect}
      />
      <CircleCityPickerModal
        visible={cityPickerOpen}
        countryCode={props.countryCode}
        countryName={props.countryName}
        selectedCity={props.city}
        onClose={() => setCityPickerOpen(false)}
        onSelect={(place) => {
          props.onCityChange(place.name);
          props.onRegionChange(place.admin1Name ?? '');
        }}
      />
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.7)' },
  keyboardWrap: { maxHeight: '92%', justifyContent: 'center' },
  card: { maxHeight: '100%', borderRadius: 24, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline },
  content: { padding: 20, gap: 12 },
  title: { color: theme.text, fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  subtitle: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  selectionHint: { color: theme.tint, fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_600SemiBold' },
  label: { color: theme.text, fontSize: 12, fontFamily: 'Archivo_700Bold', marginTop: 3 },
  input: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 15, color: theme.text, backgroundColor: theme.backgroundSubtle, borderWidth: 1, borderColor: theme.outline, fontFamily: 'Manrope_500Medium' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  selectField: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  selectCopy: { flex: 1 },
  selectLabel: { color: theme.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Archivo_700Bold' },
  selectValue: { marginTop: 4, color: theme.text, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  selectPlaceholder: { color: theme.textMuted },
  selectMeta: { marginTop: 2, color: theme.textMuted, fontSize: 11, fontFamily: 'Manrope_500Medium' },
  selectCode: { color: theme.tint, fontSize: 12, fontFamily: 'Archivo_700Bold' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 38, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline },
  pillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
  pillDisabled: { opacity: 0.4 },
  pillText: { color: theme.textMuted, fontSize: 11, fontFamily: 'Archivo_700Bold' },
  pillTextActive: { color: '#071E22' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { color: theme.text, fontSize: 12, fontFamily: 'Archivo_700Bold' },
  settingBody: { color: theme.textMuted, fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  settingValue: { color: theme.tint, fontSize: 12, fontFamily: 'Archivo_700Bold' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 9, marginTop: 4 },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline },
  primaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint },
  secondaryText: { color: theme.text, fontSize: 12, fontFamily: 'Archivo_700Bold' },
  primaryText: { color: '#071E22', fontSize: 12, fontFamily: 'Archivo_700Bold' },
});
