import { AnimatedGhanaPlaceIllustration } from "@/components/onboarding/AnimatedGhanaPlaceIllustration";
import { AnimatedGlobalLocation } from "@/components/onboarding/AnimatedGlobalLocation";
import { AnimatedRootsTree } from "@/components/onboarding/AnimatedRootsTree";
import { AnimatedValuesCompass } from "@/components/onboarding/AnimatedValuesCompass";
import { PremiumValuesSelector } from "@/components/onboarding/steps/PremiumValuesSelector";
import { PremiumInterestsSelector } from "@/components/onboarding/steps/PremiumInterestsSelector";
import { AnimatedRelationshipPaths } from "@/components/onboarding/AnimatedRelationshipPaths";
import { PremiumRelationshipIntentSelector } from "@/components/onboarding/steps/PremiumRelationshipIntentSelector";
import { AnimatedPreferenceCompass } from "@/components/onboarding/AnimatedPreferenceCompass";
import { PremiumAgeRangeSelector } from "@/components/onboarding/steps/PremiumAgeRangeSelector";
import { GhanaCityTownField } from "@/components/onboarding/steps/GhanaCityTownField";
import { GlobalCityField } from "@/components/onboarding/steps/GlobalCityField";
import { AnimatedLifestyleOrbit } from "@/components/onboarding/AnimatedLifestyleOrbit";
import { type GhanaCityTownSuggestion } from "@/lib/location/ghana-locality-shared";
import { type PremiumOnboardingFormState, type PremiumOnboardingVariant } from "@/lib/onboarding/premium-onboarding.types";
import { type RootsVisibilityOption } from "@/lib/profile/roots-options";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type DiscoveryStepKey =
  | "current_location"
  | "roots"
  | "values"
  | "interests"
  | "relationship_intent"
  | "dating_preferences";

type IntentOption = {
  value: string;
  label: string;
  description: string;
  icon: string;
};

type Props = {
  stepKey: DiscoveryStepKey;
  variant: PremiumOnboardingVariant;
  dark: boolean;
  form: PremiumOnboardingFormState;
  currentCountryCode: string;
  customTribe: string;
  errors: Record<string, string>;
  styles: any;
  responsiveCompact: boolean;
  setCustomTribe: (value: string) => void;
  updateForm: <K extends keyof PremiumOnboardingFormState>(key: K, value: PremiumOnboardingFormState[K]) => void;
  setOption: <K extends keyof PremiumOnboardingFormState>(key: K, value: PremiumOnboardingFormState[K]) => void;
  toggleRoot: (root: string) => void;
  toggleInterest: (interest: string) => void;
  openCurrentCountryPicker: () => void;
  openOriginCountryPicker: () => void;
  renderError: (key: string) => ReactNode;
  renderChoice: (label: string, selected: boolean, onPress: () => void, icon?: string) => ReactNode;
  globalRegions: readonly string[];
  ghanaRegions: readonly string[];
  rootsOptions: readonly string[];
  tribes: readonly string[];
  interests: readonly string[];
  intents: readonly IntentOption[];
  religionOptions: readonly { label: string }[];
  rootsVisibility: readonly RootsVisibilityOption[];
  onCurrentLocationAnalyticsEvent?: (event: string, payload?: Record<string, unknown>) => void;
};

export function PremiumOnboardingDiscoveryStep({
  stepKey,
  variant,
  dark,
  form,
  currentCountryCode,
  customTribe,
  errors,
  styles,
  responsiveCompact,
  setCustomTribe,
  updateForm,
  setOption,
  toggleRoot,
  toggleInterest,
  openCurrentCountryPicker,
  openOriginCountryPicker,
  renderError,
  renderChoice,
  globalRegions: _globalRegions,
  ghanaRegions,
  rootsOptions,
  tribes,
  interests,
  intents,
  religionOptions,
  rootsVisibility,
  onCurrentLocationAnalyticsEvent,
}: Props) {
  const currentCountryIsGhana = variant === "ghana" || form.currentCountry.trim().toLowerCase() === "ghana";
  const originCountryIsGhana = variant === "ghana" || form.originCountry.trim().toLowerCase() === "ghana";

  switch (stepKey) {
    case "current_location":
      return variant === "ghana" ? (
        <View style={styles.fieldBlock}>
          <View style={styles.ghanaPlaceIllustrationWrap}>
            <AnimatedGhanaPlaceIllustration size={responsiveCompact ? 228 : 266} decorative />
          </View>
          <Text style={styles.fieldLabel}>Region</Text>
          <View style={styles.chipWrap}>
            {ghanaRegions.map((region) =>
              renderChoice(region, form.region === region, () => {
                if (form.region !== region && form.city) {
                  updateForm("city", "");
                }
                onCurrentLocationAnalyticsEvent?.("region_selected", { region });
                setOption("region", region);
              }),
            )}
          </View>
          {renderError("region")}
          <GhanaCityTownField
            region={form.region}
            value={form.city}
            selectedDistrict={form.cityDistrict}
            selectedLocalityGeonameId={form.cityLocalityGeonameId}
            dark={dark}
            styles={styles}
            error={errors.city}
            onSelectLocality={(selection: GhanaCityTownSuggestion | null) => {
              updateForm("city", selection?.name ?? "");
              updateForm("cityDistrict", selection?.district ?? "");
              updateForm("cityLocalityGeonameId", selection?.geonameId ?? null);
              updateForm("cityAdmin1Code", "");
              updateForm("cityLatitude", selection?.latitude ?? null);
              updateForm("cityLongitude", selection?.longitude ?? null);
            }}
            onAnalyticsEvent={onCurrentLocationAnalyticsEvent}
          />
        </View>
      ) : (
        <View style={styles.fieldBlock}>
          <View style={styles.globalLocationIllustrationWrap}>
            <AnimatedGlobalLocation size={responsiveCompact ? 204 : 238} selected={Boolean(form.currentCountry)} />
          </View>
          <Text style={styles.fieldLabel}>Current country</Text>
          <Pressable style={[styles.selectBox, errors.currentCountry && styles.inputError]} onPress={openCurrentCountryPicker}>
            <Text style={[styles.selectText, !form.currentCountry && styles.selectPlaceholder]}>
              {form.currentCountry || "Select country"}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={styles.tokens.accent.color} />
          </Pressable>
          {renderError("currentCountry")}
          {currentCountryIsGhana ? (
            <>
              <Text style={[styles.fieldLabel, styles.spacedLabel]}>Ghana region</Text>
              <View style={styles.chipWrap}>
                {ghanaRegions.map((region) => renderChoice(region, form.region === region, () => {
                  if (form.region !== region && form.city) updateForm("city", "");
                  onCurrentLocationAnalyticsEvent?.("region_selected", { region });
                  setOption("region", region);
                }))}
              </View>
              {renderError("region")}
              <GhanaCityTownField region={form.region} value={form.city} selectedDistrict={form.cityDistrict} selectedLocalityGeonameId={form.cityLocalityGeonameId} dark={dark} styles={styles} error={errors.city} onSelectLocality={(selection: GhanaCityTownSuggestion | null) => {
                updateForm("city", selection?.name ?? "");
                updateForm("cityDistrict", selection?.district ?? "");
                updateForm("cityLocalityGeonameId", selection?.geonameId ?? null);
                updateForm("cityAdmin1Code", "");
                updateForm("cityLatitude", selection?.latitude ?? null);
                updateForm("cityLongitude", selection?.longitude ?? null);
              }} onAnalyticsEvent={onCurrentLocationAnalyticsEvent} />
            </>
          ) : <GlobalCityField countryCode={currentCountryCode} countryName={form.currentCountry} value={form.city} region={form.region} selectedGeonameId={form.cityLocalityGeonameId} dark={dark} styles={styles} onSelect={(place) => {
            updateForm("city", place?.name ?? "");
            updateForm("region", place?.admin1Name ?? "");
            updateForm("cityDistrict", place?.admin1Name ?? "");
            updateForm("cityLocalityGeonameId", place?.geonameId ?? null);
            updateForm("cityAdmin1Code", place?.admin1Code ?? "");
            updateForm("cityLatitude", place?.latitude ?? null);
            updateForm("cityLongitude", place?.longitude ?? null);
          }} />}
        </View>
      );
    case "roots":
      return originCountryIsGhana ? (
        <View style={styles.fieldBlock}>
          <View style={styles.rootsIllustrationWrap}>
            <AnimatedRootsTree
              size={responsiveCompact ? 220 : 260}
              selectedCount={form.roots.length}
              decorative
            />
          </View>
          {variant === "global" ? (
            <>
              <Text style={styles.fieldLabel}>Where you’re from</Text>
              <Pressable style={styles.selectBox} onPress={openOriginCountryPicker}>
                <Text style={styles.selectText}>{form.originCountry}</Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={styles.tokens.accent.color} />
              </Pressable>
              <Text style={[styles.fieldLabel, styles.spacedLabel]}>Your Ghana roots</Text>
            </>
          ) : null}
          <View style={styles.chipWrap}>
            {rootsOptions.map((root) => renderChoice(root, form.roots.includes(root), () => toggleRoot(root)))}
          </View>
          {renderError("roots")}
          <TextInput
            value={form.rootsNote}
            onChangeText={(text) => updateForm("rootsNote", text)}
            placeholder="Tell us more, if you'd like"
            placeholderTextColor={styles.tokens.muted.color}
            style={[styles.input, styles.inlineInput, errors.rootsNote && styles.inputError]}
          />
          <Text style={styles.subtleNote}>
            You can add a specific group, family story, or cultural connection.
          </Text>
          {renderError("rootsNote")}
          <Text style={[styles.fieldLabel, styles.spacedLabel]}>Who can see this?</Text>
          <View style={styles.stackChoices}>
            {rootsVisibility.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.storyOption, form.rootsVisibility === option.value && styles.storyOptionSelected]}
                onPress={() => setOption("rootsVisibility", option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: form.rootsVisibility === option.value }}
              >
                <View style={styles.storyOptionLead}>
                  <View style={[styles.storyOptionIconWrap, form.rootsVisibility === option.value && styles.storyOptionIconWrapSelected]}>
                    <MaterialCommunityIcons
                      name={option.icon as any}
                      size={17}
                      color={form.rootsVisibility === option.value ? styles.tokens.accent.color : styles.tokens.muted.color}
                    />
                  </View>
                  <View style={styles.storyOptionBody}>
                    <Text style={[styles.storyOptionText, form.rootsVisibility === option.value && styles.storyOptionTextSelected]}>
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.storyOptionSubtext,
                        form.rootsVisibility === option.value && styles.storyOptionSubtextSelected,
                      ]}
                    >
                      {option.subtitle}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name={form.rootsVisibility === option.value ? "radiobox-marked" : "radiobox-blank"}
                  size={20}
                  color={form.rootsVisibility === option.value ? styles.tokens.accent.color : styles.tokens.muted.color}
                />
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.fieldBlock}>
          <View style={styles.rootsIllustrationWrap}>
            <AnimatedRootsTree size={responsiveCompact ? 204 : 238} selectedCount={form.tribe ? 1 : 0} decorative />
          </View>
          <Text style={styles.fieldLabel}>Where you’re from, optional</Text>
          <Pressable style={styles.selectBox} onPress={openOriginCountryPicker}>
            <Text style={[styles.selectText, !form.originCountry && styles.selectPlaceholder]}>
              {form.originCountry || "Choose origin country"}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={styles.tokens.accent.color} />
          </Pressable>
          <Text style={[styles.fieldLabel, styles.spacedLabel]}>Cultural identity</Text>
          <View style={styles.chipWrap}>
            {tribes.map((tribe) =>
              renderChoice(tribe, form.tribe === tribe, () => {
                setOption("tribe", tribe);
                if (tribe !== "Other") setCustomTribe("");
              }),
            )}
          </View>
          {form.tribe === "Other" ? (
            <TextInput
              value={customTribe}
              onChangeText={setCustomTribe}
              placeholder="Add your cultural background"
              placeholderTextColor={styles.tokens.muted.color}
              style={[styles.input, styles.inlineInput, errors.tribe && styles.inputError]}
            />
          ) : null}
          {renderError("tribe")}
        </View>
      );
    case "values":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.valuesIllustrationWrap}>
            <AnimatedValuesCompass
              size={responsiveCompact ? 190 : 224}
              selected={!!form.religion}
              decorative
            />
          </View>
          <PremiumValuesSelector
            options={religionOptions}
            selectedValue={form.religion}
            styles={styles}
            onSelect={(value) => setOption("religion", value)}
          />
          {renderError("religion")}
        </View>
      );
    case "interests":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.interestIllustrationWrap}>
            <AnimatedLifestyleOrbit
              size={responsiveCompact ? 158 : 186}
              decorative
              selectedCount={form.interests.length}
            />
          </View>
          <PremiumInterestsSelector
            interests={interests}
            selected={form.interests}
            styles={styles}
            onToggle={toggleInterest}
          />
          {renderError("interests")}
        </View>
      );
    case "relationship_intent":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.relationshipIllustrationWrap}>
            <AnimatedRelationshipPaths
              size={responsiveCompact ? 196 : 230}
              selected={!!form.lookingFor}
              decorative
            />
          </View>
          <PremiumRelationshipIntentSelector
            intents={intents}
            selectedValue={form.lookingFor}
            styles={styles}
            onSelect={(value) => setOption("lookingFor", value)}
          />
          {renderError("lookingFor")}
        </View>
      );
    case "dating_preferences":
      const minAge = Math.min(99, Math.max(18, Number(form.minAgeInterest) || 18));
      const maxAge = Math.min(99, Math.max(minAge, Number(form.maxAgeInterest) || minAge));
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.preferenceIllustrationWrap}>
            <AnimatedPreferenceCompass size={responsiveCompact ? 194 : 226} minAge={minAge} maxAge={maxAge} decorative />
          </View>
          <PremiumAgeRangeSelector
            min={18}
            max={99}
            valueMin={minAge}
            valueMax={maxAge}
            styles={styles}
            onChange={(nextMin, nextMax) => {
              updateForm("minAgeInterest", String(nextMin));
              updateForm("maxAgeInterest", String(nextMax));
            }}
          />
          {renderError("minAgeInterest")}
          {renderError("maxAgeInterest")}
        </View>
      );
    default:
      return null;
  }
}
