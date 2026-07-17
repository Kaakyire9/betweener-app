import { PremiumAgeRangeSelector } from '@/components/onboarding/steps/PremiumAgeRangeSelector';
import { GlobalCityField } from '@/components/onboarding/steps/GlobalCityField';
import {
  PREMIUM_ONBOARDING_INTENTS,
} from '@/lib/onboarding/premium-onboarding.config';
import { GHANA_ROOT_OPTIONS, GLOBAL_ROOT_OPTIONS, ROOTS_VISIBILITY_OPTIONS } from '@/lib/profile/roots-options';
import { formatReligionLabel } from '@/lib/profile/religion';
import { toFlagEmoji } from '@/lib/location/location-display';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  formData: any;
  styles: any;
  theme: any;
  isGhana: boolean;
  countryManaged: boolean;
  countryPolicyMessage?: string;
  countryVerificationBusy: boolean;
  onVerifyCountry: () => void;
  dark: boolean;
  selectedInterests: string[];
  loadingInterests: boolean;
  customOccupation: string;
  setCustomOccupation: (value: string) => void;
  handleInputChange: (field: string, value: any) => void;
  handleRootToggle: (value: string) => void;
  setShowOccupationPicker: (value: boolean) => void;
  setShowRegionPicker: (value: boolean) => void;
  openCurrentCountryPicker: () => void;
  openOriginCountryPicker: () => void;
  openCityPicker: () => void;
  clearCity: () => void;
  setShowReligionPicker: (value: boolean) => void;
  setShowInterestsPicker: (value: boolean) => void;
};

type ChapterKey = 'work' | 'story' | 'location' | 'roots' | 'values' | 'interests' | 'intent' | 'preferences';

function ProfileChapter({
  chapterKey,
  icon,
  eyebrow,
  title,
  body,
  summary,
  complete,
  expanded,
  onToggle,
  children,
  styles,
  theme,
}: {
  chapterKey: ChapterKey;
  icon: string;
  eyebrow: string;
  title: string;
  body?: string;
  summary: string;
  complete: boolean;
  expanded: boolean;
  onToggle: (key: ChapterKey) => void;
  children: ReactNode;
  styles: any;
  theme: any;
}) {
  return (
    <View style={[styles.ghanaCoreSection, expanded && styles.ghanaCoreSectionExpanded]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}. ${summary}`}
        activeOpacity={0.82}
        style={styles.ghanaChapterHeader}
        onPress={() => onToggle(chapterKey)}
      >
        <View style={styles.ghanaCoreIcon}>
          <MaterialCommunityIcons name={icon as any} size={18} color={theme.tint} />
        </View>
        <View style={styles.ghanaCoreHeadingCopy}>
          <View style={styles.ghanaChapterEyebrowRow}>
            <Text style={styles.ghanaCoreEyebrow}>{eyebrow}</Text>
            <View style={[styles.ghanaChapterStatus, complete && styles.ghanaChapterStatusComplete]}>
              <Text style={[styles.ghanaChapterStatusText, complete && styles.ghanaChapterStatusTextComplete]}>{complete ? 'Complete' : 'Add details'}</Text>
            </View>
          </View>
          <Text style={styles.ghanaCoreTitle}>{title}</Text>
          {!expanded ? <Text style={styles.ghanaChapterSummary} numberOfLines={1}>{summary}</Text> : null}
        </View>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={21} color={theme.textMuted} />
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.ghanaChapterContent}>
          {body ? <Text style={styles.ghanaCoreBody}>{body}</Text> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}

export default function GhanaOnboardingProfileSections({
  formData,
  styles,
  theme,
  isGhana,
  countryManaged,
  countryPolicyMessage,
  countryVerificationBusy,
  onVerifyCountry,
  dark,
  selectedInterests,
  loadingInterests,
  customOccupation,
  setCustomOccupation,
  handleInputChange,
  handleRootToggle,
  setShowOccupationPicker,
  setShowRegionPicker,
  openCurrentCountryPicker,
  openOriginCountryPicker,
  openCityPicker,
  clearCity,
  setShowReligionPicker,
  setShowInterestsPicker,
}: Props) {
  const [expandedChapter, setExpandedChapter] = useState<ChapterKey | null>('work');
  const minAge = Number.parseInt(String(formData.min_age_interest || '24'), 10) || 24;
  const maxAge = Number.parseInt(String(formData.max_age_interest || '34'), 10) || 34;
  const currentCountryIsGhana = formData.current_country_code === 'GH' || String(formData.current_country || '').trim().toLowerCase() === 'ghana';
  const originCountryIsGhana = isGhana || formData.origin_country_code === 'GH' || String(formData.origin_country || '').trim().toLowerCase() === 'ghana';
  const globalCityStyles = {
    citySection: { marginTop: 12 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
    fieldLabel: styles.ghanaLocationMeta,
    optionalLabel: styles.ghanaLocationMeta,
    selectBox: styles.ghanaPremiumSelect,
    selectBoxSelected: undefined,
    selectValueWrap: { flex: 1 },
    selectText: styles.ghanaPremiumSelectText,
    selectPlaceholder: styles.selectButtonPlaceholder,
    selectMetaText: styles.ghanaLocationMeta,
    helperText: styles.fieldHelperText ?? styles.ghanaLocationMeta,
    tokens: { accent: { color: theme.tint }, muted: { color: theme.textMuted } },
  };
  const toggleChapter = (key: ChapterKey) => setExpandedChapter((current) => current === key ? null : key);

  return (
    <View style={styles.ghanaCoreShell}>
      <View style={styles.ghanaCoreIntro}>
        <Text style={styles.ghanaCoreIntroEyebrow}>{isGhana ? 'YOUR GHANA STORY' : 'YOUR PROFILE STORY'}</Text>
        <Text style={styles.ghanaCoreIntroTitle}>Refine what people discover about you.</Text>
        <Text style={styles.ghanaCoreIntroBody}>These details mirror the journey you completed during {isGhana ? 'Ghana ' : ''}onboarding.</Text>
      </View>

      <ProfileChapter chapterKey="work" icon="briefcase-outline" eyebrow="WORK" title="What do you do?" summary={formData.occupation || 'Add your occupation'} complete={Boolean(formData.occupation)} expanded={expandedChapter === 'work'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <TouchableOpacity style={styles.ghanaPremiumSelect} onPress={() => setShowOccupationPicker(true)}>
          <Text style={formData.occupation ? styles.ghanaPremiumSelectText : styles.selectButtonPlaceholder}>
            {formData.occupation || 'Choose what fits best'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
        </TouchableOpacity>
        {formData.occupation === 'Other' ? (
          <TextInput
            style={[styles.textInput, { marginTop: 10 }]}
            value={customOccupation}
            onChangeText={setCustomOccupation}
            placeholder="Enter your occupation"
            maxLength={100}
            onBlur={() => customOccupation.trim() && handleInputChange('occupation', customOccupation.trim())}
          />
        ) : null}
      </ProfileChapter>

      <ProfileChapter chapterKey="story" icon="text-box-edit-outline" eyebrow="YOUR STORY" title="Say it in your own words" body="A short introduction gives people something real to connect with." summary={formData.bio?.trim() ? `${formData.bio.trim().slice(0, 54)}${formData.bio.trim().length > 54 ? '…' : ''}` : 'Add a short introduction'} complete={Boolean(formData.bio?.trim())} expanded={expandedChapter === 'story'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <TextInput
          style={[styles.textInput, styles.textArea, styles.ghanaPremiumTextArea]}
          value={formData.bio}
          onChangeText={(value) => handleInputChange('bio', value)}
          placeholder="Share the energy, values or details that feel most like you..."
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={500}
        />
        <Text style={styles.characterCount}>{formData.bio.length}/500</Text>
      </ProfileChapter>

      <ProfileChapter chapterKey="location" icon="map-marker-radius-outline" eyebrow="LOCATION" title="Where you are" body="Tell us where you live now, then optionally add where your story began." summary={[formData.city, formData.region, formData.current_country].filter(Boolean).join(' · ')} complete={Boolean(formData.current_country && (formData.city || formData.region))} expanded={expandedChapter === 'location'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <Text style={styles.ghanaLocationMeta}>CURRENT COUNTRY</Text>
        {countryManaged ? <>
          <View style={styles.ghanaLocationCountryCard}>
            <Text style={styles.ghanaCountryFlag}>{toFlagEmoji(formData.current_country_code || 'GH')}</Text>
            <View style={{ flex: 1 }}><Text style={styles.ghanaLocationLabel}>{formData.current_country || 'Ghana'}</Text><Text style={styles.ghanaLocationMeta}>Server-verified current country</Text></View>
            <MaterialCommunityIcons name="lock-outline" size={17} color={theme.textMuted} />
          </View>
          {countryPolicyMessage ? <Text style={styles.fieldHelperText}>{countryPolicyMessage}</Text> : null}
          <TouchableOpacity
            style={[styles.countryVerificationButton, countryVerificationBusy && styles.disabledSelectButton]}
            onPress={onVerifyCountry}
            disabled={countryVerificationBusy}
            accessibilityRole="button"
            accessibilityLabel="Verify current country with precise location"
          >
            {countryVerificationBusy
              ? <ActivityIndicator size="small" color={theme.tint} />
              : <MaterialCommunityIcons name="crosshairs-gps" size={18} color={theme.tint} />}
            <Text style={styles.countryVerificationButtonText}>
              {countryVerificationBusy ? 'Checking secure location…' : 'Verify a move with precise location'}
            </Text>
          </TouchableOpacity>
        </> : <>
          <TouchableOpacity style={styles.ghanaPremiumSelect} onPress={openCurrentCountryPicker}>
            <Text style={formData.current_country ? styles.ghanaPremiumSelectText : styles.selectButtonPlaceholder}>{formData.current_country || 'Choose current country'}</Text><MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </>}
        {currentCountryIsGhana ? <>
          <Text style={[styles.ghanaLocationMeta, { marginTop: 12 }]}>REGION</Text>
          <TouchableOpacity style={styles.ghanaPremiumSelect} onPress={() => setShowRegionPicker(true)}>
            <Text style={formData.region ? styles.ghanaPremiumSelectText : styles.selectButtonPlaceholder}>{formData.region || 'Choose your region'}</Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.ghanaLocationMeta, { marginTop: 12 }]}>CURRENT CITY OR TOWN</Text>
          <TouchableOpacity style={[styles.ghanaPremiumSelect, !formData.region && styles.disabledSelectButton]} disabled={!formData.region} onPress={openCityPicker}>
            <View style={{ flex: 1 }}><Text style={formData.city ? styles.ghanaPremiumSelectText : styles.selectButtonPlaceholder}>{formData.city || 'Add a city or town (optional)'}</Text>{formData.locality_district ? <Text style={styles.ghanaLocationMeta}>{formData.locality_district}</Text> : null}</View>
            {formData.city ? <TouchableOpacity onPress={(event) => { event.stopPropagation(); clearCity(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><MaterialCommunityIcons name="close-circle-outline" size={18} color={theme.textMuted} /></TouchableOpacity> : <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />}
          </TouchableOpacity>
        </> : <>
          {formData.current_country ? <GlobalCityField countryCode={formData.current_country_code || ''} countryName={formData.current_country} value={formData.city || ''} region={formData.region} selectedGeonameId={formData.locality_geoname_id} dark={dark} styles={globalCityStyles} onSelect={(place) => {
            handleInputChange('city', place?.name ?? '');
            handleInputChange('region', place?.admin1Name ?? '');
            handleInputChange('locality_district', place?.admin1Name ?? '');
            handleInputChange('locality_geoname_id', place?.geonameId ?? null);
            handleInputChange('locality_admin1_code', place?.admin1Code ?? '');
            handleInputChange('locality_provider', place ? 'geonames' : null);
            handleInputChange('latitude', place?.latitude ?? null);
            handleInputChange('longitude', place?.longitude ?? null);
            handleInputChange('location_precision', place ? 'CITY' : 'COUNTRY');
          }} /> : null}
        </>}
        {!isGhana ? <>
          <Text style={[styles.ghanaLocationMeta, { marginTop: 14 }]}>WHERE YOU’RE FROM (OPTIONAL)</Text>
          <TouchableOpacity style={styles.ghanaPremiumSelect} onPress={openOriginCountryPicker}><Text style={formData.origin_country ? styles.ghanaPremiumSelectText : styles.selectButtonPlaceholder}>{formData.origin_country || 'Choose origin country'}</Text><MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} /></TouchableOpacity>
        </> : null}
      </ProfileChapter>

      <ProfileChapter chapterKey="roots" icon="family-tree" eyebrow="ROOTS" title="The identities in your story" body="Choose the communities and cultures that feel part of who you are." summary={formData.roots?.length ? formData.roots.join(' · ') : 'Add the roots that matter to you'} complete={Boolean(formData.roots?.length)} expanded={expandedChapter === 'roots'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <View style={styles.optionChipRow}>
          {(originCountryIsGhana ? GHANA_ROOT_OPTIONS : GLOBAL_ROOT_OPTIONS).map((option) => {
            const selected = formData.roots.includes(option);
            return (
              <TouchableOpacity
                key={option}
                style={[styles.optionChip, selected && styles.optionChipSelected]}
                onPress={() => {
                  if (originCountryIsGhana) {
                    handleRootToggle(option);
                  } else {
                    handleInputChange('roots', selected ? [] : [option]);
                    handleInputChange('tribe', selected ? '' : option);
                  }
                }}
              >
                {selected ? <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" /> : null}
                <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput style={[styles.textInput, { marginTop: 12 }]} value={formData.roots_note} onChangeText={(value) => handleInputChange('roots_note', value)} placeholder="Tell us more, if you'd like" maxLength={120} />
        <View style={styles.ghanaVisibilityRow}>
          {ROOTS_VISIBILITY_OPTIONS.map((option) => {
            const selected = formData.roots_visibility === option.value;
            return (
              <TouchableOpacity key={option.value} style={[styles.ghanaVisibilityChip, selected && styles.ghanaVisibilityChipSelected]} onPress={() => handleInputChange('roots_visibility', option.value)}>
                <Text style={[styles.ghanaVisibilityText, selected && styles.ghanaVisibilityTextSelected]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ProfileChapter>

      <ProfileChapter chapterKey="values" icon="compass-rose" eyebrow="VALUES" title="What guides you?" body="Faith and worldview can shape how we connect." summary={formatReligionLabel(formData.religion) || 'Add your faith or worldview'} complete={Boolean(formData.religion)} expanded={expandedChapter === 'values'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <TouchableOpacity style={styles.ghanaPremiumSelect} onPress={() => setShowReligionPicker(true)}>
          <Text style={formData.religion ? styles.ghanaPremiumSelectText : styles.selectButtonPlaceholder}>{formatReligionLabel(formData.religion) || 'Choose what feels accurate'}</Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
        </TouchableOpacity>
      </ProfileChapter>

      <ProfileChapter chapterKey="interests" icon="creation-outline" eyebrow="INTERESTS" title="What brings you to life?" body="Keep a focused mix of 3–5 things you genuinely enjoy." summary={selectedInterests.length ? `${selectedInterests.slice(0, 3).join(', ')}${selectedInterests.length > 3 ? ` +${selectedInterests.length - 3}` : ''}` : 'Choose 3–5 interests'} complete={selectedInterests.length >= 3 && selectedInterests.length <= 5} expanded={expandedChapter === 'interests'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <TouchableOpacity style={styles.ghanaPremiumSelect} onPress={() => setShowInterestsPicker(true)} disabled={loadingInterests}>
          <Text style={selectedInterests.length ? styles.ghanaPremiumSelectText : styles.selectButtonPlaceholder}>
            {loadingInterests ? 'Loading interests...' : selectedInterests.length ? `${selectedInterests.length} / 5 selected` : 'Choose 3–5 interests'}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
        </TouchableOpacity>
        {selectedInterests.length ? (
          <View style={styles.ghanaSelectedInterests}>
            {selectedInterests.map((interest) => <View key={interest} style={styles.ghanaInterestChip}><Text style={styles.ghanaInterestText}>{interest}</Text></View>)}
          </View>
        ) : null}
      </ProfileChapter>

      <ProfileChapter chapterKey="intent" icon="heart-multiple-outline" eyebrow="INTENT" title="What are you hoping to find?" body="Choose the direction that feels most honest right now." summary={PREMIUM_ONBOARDING_INTENTS.find((intent) => intent.value === formData.looking_for)?.label || formData.looking_for || 'Choose your relationship direction'} complete={Boolean(formData.looking_for)} expanded={expandedChapter === 'intent'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <View style={{ gap: 9 }}>
          {PREMIUM_ONBOARDING_INTENTS.map((intent) => {
            const selected = formData.looking_for === intent.value;
            return (
              <TouchableOpacity key={intent.value} style={[styles.ghanaIntentCard, selected && styles.ghanaIntentCardSelected]} onPress={() => handleInputChange('looking_for', intent.value)}>
                <View style={[styles.ghanaIntentIcon, selected && styles.ghanaIntentIconSelected]}><MaterialCommunityIcons name={intent.icon as any} size={19} color={selected ? '#FFFFFF' : theme.tint} /></View>
                <View style={{ flex: 1 }}><Text style={[styles.ghanaIntentTitle, selected && styles.ghanaIntentTitleSelected]}>{intent.label}</Text><Text style={[styles.ghanaIntentBody, selected && styles.ghanaIntentBodySelected]}>{intent.description}</Text></View>
                {selected ? <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ProfileChapter>

      <ProfileChapter chapterKey="preferences" icon="account-heart-outline" eyebrow="PREFERENCES" title="Who are you open to meeting?" body="This range shapes discovery and can change anytime." summary={`Ages ${minAge}–${maxAge}`} complete={minAge >= 18 && maxAge >= minAge} expanded={expandedChapter === 'preferences'} onToggle={toggleChapter} styles={styles} theme={theme}>
        <PremiumAgeRangeSelector min={18} max={99} valueMin={minAge} valueMax={maxAge} styles={styles} onChange={(min, max) => { handleInputChange('min_age_interest', String(min)); handleInputChange('max_age_interest', String(max)); }} />
      </ProfileChapter>
    </View>
  );
}
