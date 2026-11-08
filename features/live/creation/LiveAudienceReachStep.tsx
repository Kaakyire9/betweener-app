import { findCountryByCode, type CountryOption } from '@/lib/location/countries';
import type { GlobalLocalitySuggestion } from '@/lib/location/global-locality-shared';
import {
  CircleCityPickerModal,
  CircleCountryPickerModal,
} from '@/features/studio/circles/CircleAudienceLocationPickers';
import { Check, ChevronRight, Globe2, LockKeyhole, Map, MapPin, Plane } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type LiveVisualTheme, useLiveVisualTheme } from '../components/live-visual-tokens.ts';
import {
  LIVE_AUDIENCE_REACH_OPTIONS,
  getLiveAudienceReachLabel,
  getLiveAudienceSummary,
  toggleLiveAudienceScope,
  type LiveAudienceReachScope,
} from './live-audience-policy.ts';
import type { LiveCreationDraft } from './live-creation-draft.ts';

type PickerTarget = 'primary' | 'origin' | 'destination' | null;

const reachDescription: Record<LiveAudienceReachScope, string> = {
  global: 'Available across Betweener wherever Live is supported.',
  country: 'Shown to members currently in one country.',
  local: 'Focused on members in one city or town.',
  diaspora: 'For people living abroad from selected heritage countries.',
  invite_only: 'Hidden from discovery; only invited participants can enter.',
};

const reachIcon = (scope: LiveAudienceReachScope, color: string): ReactNode => {
  if (scope === 'global') return <Globe2 size={19} color={color} />;
  if (scope === 'country') return <Map size={19} color={color} />;
  if (scope === 'local') return <MapPin size={19} color={color} />;
  if (scope === 'diaspora') return <Plane size={19} color={color} />;
  return <LockKeyhole size={19} color={color} />;
};

export function LiveAudienceReachStep({
  draft,
  preserveExisting,
  onChange,
}: {
  draft: LiveCreationDraft;
  preserveExisting: boolean;
  onChange: (updates: Partial<LiveCreationDraft>) => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const hasCountry = draft.audienceScopes.includes('country');
  const hasLocal = draft.audienceScopes.includes('local');
  const hasDiaspora = draft.audienceScopes.includes('diaspora');
  const countryNames = (codes: readonly string[]) => codes
    .map((code) => findCountryByCode(code)?.label ?? code)
    .join(', ');

  const selectedCountryCodes = pickerTarget === 'origin'
    ? draft.diasporaOriginCountryCodes
    : pickerTarget === 'destination'
      ? draft.diasporaDestinationCountryCodes
      : draft.audienceCountryCode ? [draft.audienceCountryCode] : [];

  const toggleCode = (values: readonly string[], code: string) => (
    values.includes(code) ? values.filter((value) => value !== code) : [...values, code]
  );

  const selectCountry = (country: CountryOption) => {
    if (pickerTarget === 'origin') {
      const origins = toggleCode(draft.diasporaOriginCountryCodes, country.code);
      onChange({
        diasporaOriginCountryCodes: origins,
        diasporaDestinationCountryCodes: draft.diasporaDestinationCountryCodes
          .filter((code) => !origins.includes(code)),
      });
      return;
    }
    if (pickerTarget === 'destination') {
      onChange({
        diasporaDestinationCountryCodes: toggleCode(
          draft.diasporaDestinationCountryCodes,
          country.code,
        ).filter((code) => !draft.diasporaOriginCountryCodes.includes(code)),
      });
      return;
    }
    onChange({
      audienceCountryCode: country.code,
      audienceCountryName: country.label,
      audienceRegion: '',
      audienceCity: '',
    });
    setPickerTarget(null);
  };

  const selectCity = (place: GlobalLocalitySuggestion) => onChange({
    audienceCity: place.name,
    audienceRegion: place.admin1Name ?? '',
  });

  if (draft.circleId) {
    return (
      <View style={styles.step}>
        <Text style={styles.kicker}>AUDIENCE &amp; REACH</Text>
        <Text style={styles.stepTitle}>This Live belongs to its Circle.</Text>
        <Text style={styles.stepCopy}>Circle Live cannot define a separate audience. Discovery follows the Circle&apos;s current Reach; entry still requires membership.</Text>
        <View style={styles.lockedCard}>
          <View style={styles.lockedIcon}><Map size={21} color={visual.teal} /></View>
          <View style={styles.lockedCopy}>
            <Text style={styles.lockedTitle}>{draft.circleReachLabel || 'Circle Reach'}</Text>
            <Text style={styles.lockedBody}>Inherited from {draft.circleName || 'this Circle'} and enforced by the server.</Text>
          </View>
          <LockKeyhole size={17} color={visual.textMuted} />
        </View>
      </View>
    );
  }

  if (preserveExisting) {
    return (
      <View style={styles.step}>
        <Text style={styles.kicker}>AUDIENCE &amp; REACH</Text>
        <Text style={styles.stepTitle}>Your audience stays protected.</Text>
        <Text style={styles.stepCopy}>Editing the title, story or schedule will not silently replace this Live&apos;s existing audience policy.</Text>
        <View style={styles.lockedCard}>
          <View style={styles.lockedIcon}><LockKeyhole size={21} color={visual.teal} /></View>
          <View style={styles.lockedCopy}>
            <Text style={styles.lockedTitle}>Existing Reach preserved</Text>
            <Text style={styles.lockedBody}>Audience changes use a separate version-checked action before backstage opens.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.step}>
      <Text style={styles.kicker}>AUDIENCE &amp; REACH</Text>
      <Text style={styles.stepTitle}>Who should discover this Live?</Text>
      <Text style={styles.stepCopy}>Reach controls discovery and admission. Country or Local can be combined with Diaspora.</Text>
      <View style={styles.summary}><Text style={styles.summaryText}>{getLiveAudienceSummary(draft)}</Text></View>
      <View style={styles.optionGrid}>
        {LIVE_AUDIENCE_REACH_OPTIONS.map((scope) => {
          const selected = draft.audienceScopes.includes(scope);
          return (
            <Pressable
              key={scope}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange({
                audienceScopes: toggleLiveAudienceScope(draft.audienceScopes, scope),
              })}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View style={styles.optionHeader}>
                <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                  {reachIcon(scope, selected ? visual.accentContrast : visual.teal)}
                </View>
                {selected ? <Check size={17} color={visual.teal} /> : null}
              </View>
              <Text style={styles.optionTitle}>{getLiveAudienceReachLabel(scope)}</Text>
              <Text style={styles.optionBody}>{reachDescription[scope]}</Text>
            </Pressable>
          );
        })}
      </View>

      {hasCountry || hasLocal ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose Live country" style={styles.selectField} onPress={() => setPickerTarget('primary')}>
            <View style={styles.selectCopy}>
              <Text style={styles.selectLabel}>COUNTRY</Text>
              <Text style={[styles.selectValue, !draft.audienceCountryName && styles.placeholder]}>{draft.audienceCountryName || 'Choose country'}</Text>
            </View>
            <Text style={styles.selectCode}>{draft.audienceCountryCode}</Text>
            <ChevronRight size={18} color={visual.teal} />
          </Pressable>
          {hasLocal ? (
            <Pressable
              disabled={!draft.audienceCountryCode}
              accessibilityRole="button"
              accessibilityLabel="Choose Live city"
              accessibilityState={{ disabled: !draft.audienceCountryCode }}
              style={[styles.selectField, !draft.audienceCountryCode && styles.disabled]}
              onPress={() => setCityPickerOpen(true)}
            >
              <View style={styles.selectCopy}>
                <Text style={styles.selectLabel}>CITY OR TOWN</Text>
                <Text style={[styles.selectValue, !draft.audienceCity && styles.placeholder]}>{draft.audienceCity || 'Choose locality'}</Text>
                {draft.audienceRegion ? <Text style={styles.selectMeta}>{draft.audienceRegion}</Text> : null}
              </View>
              <ChevronRight size={18} color={visual.teal} />
            </Pressable>
          ) : null}
        </>
      ) : null}

      {hasDiaspora ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose diaspora heritage countries" style={styles.selectField} onPress={() => setPickerTarget('origin')}>
            <View style={styles.selectCopy}>
              <Text style={styles.selectLabel}>HERITAGE COUNTRIES</Text>
              <Text style={[styles.selectValue, !draft.diasporaOriginCountryCodes.length && styles.placeholder]}>{countryNames(draft.diasporaOriginCountryCodes) || 'Choose at least one country'}</Text>
            </View>
            <ChevronRight size={18} color={visual.teal} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose diaspora host countries" style={styles.selectField} onPress={() => setPickerTarget('destination')}>
            <View style={styles.selectCopy}>
              <Text style={styles.selectLabel}>CURRENT COUNTRIES</Text>
              <Text style={[styles.selectValue, !draft.diasporaDestinationCountryCodes.length && styles.placeholder]}>{countryNames(draft.diasporaDestinationCountryCodes) || 'Any country outside the heritage country'}</Text>
            </View>
            <ChevronRight size={18} color={visual.teal} />
          </Pressable>
        </>
      ) : null}

      <CircleCountryPickerModal
        visible={pickerTarget !== null}
        title={pickerTarget === 'origin' ? 'Heritage countries' : pickerTarget === 'destination' ? 'Current countries' : 'Live country'}
        selectedCodes={selectedCountryCodes}
        multiple={pickerTarget === 'origin' || pickerTarget === 'destination'}
        onClose={() => setPickerTarget(null)}
        onSelect={selectCountry}
      />
      <CircleCityPickerModal
        visible={cityPickerOpen}
        countryCode={draft.audienceCountryCode}
        countryName={draft.audienceCountryName}
        selectedCity={draft.audienceCity}
        onClose={() => setCityPickerOpen(false)}
        onSelect={selectCity}
      />
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  step: { gap: 4 },
  kicker: { color: visual.teal, fontSize: 9, letterSpacing: 1.8, fontFamily: 'Manrope_800ExtraBold' },
  stepTitle: { color: visual.text, fontSize: 30, lineHeight: 35, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 7 },
  stepCopy: { color: visual.textMuted, fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium', marginTop: 6, marginBottom: 14 },
  summary: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: visual.tealSoft, marginBottom: 8 },
  summaryText: { color: visual.teal, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  optionGrid: { gap: 10 },
  option: { minHeight: 112, padding: 15, borderRadius: 21, borderWidth: 1, borderColor: visual.border, backgroundColor: visual.surface },
  optionSelected: { borderColor: visual.teal, backgroundColor: visual.tealSoft },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surfaceSoft },
  optionIconSelected: { backgroundColor: visual.teal },
  optionTitle: { color: visual.text, fontSize: 14, fontFamily: 'Manrope_800ExtraBold', marginTop: 10 },
  optionBody: { color: visual.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium', marginTop: 4 },
  selectField: { minHeight: 68, marginTop: 12, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 18, borderWidth: 1, borderColor: visual.border, backgroundColor: visual.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectCopy: { flex: 1 },
  selectLabel: { color: visual.teal, fontSize: 8, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  selectValue: { color: visual.text, fontSize: 12, lineHeight: 17, fontFamily: 'Manrope_700Bold', marginTop: 4 },
  selectMeta: { color: visual.textMuted, fontSize: 9, fontFamily: 'Manrope_500Medium', marginTop: 2 },
  selectCode: { color: visual.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  placeholder: { color: visual.textMuted },
  disabled: { opacity: 0.5 },
  lockedCard: { minHeight: 92, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: visual.borderStrong, backgroundColor: visual.surface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lockedIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.tealSoft },
  lockedCopy: { flex: 1 },
  lockedTitle: { color: visual.text, fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  lockedBody: { color: visual.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium', marginTop: 4 },
});
