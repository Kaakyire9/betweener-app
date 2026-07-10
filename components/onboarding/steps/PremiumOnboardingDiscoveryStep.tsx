import { GhanaCityTownField } from "@/components/onboarding/steps/GhanaCityTownField";
import { AnimatedLifestyleOrbit } from "@/components/onboarding/AnimatedLifestyleOrbit";
import { type GhanaCityTownSuggestion } from "@/lib/location/ghana-locality-shared";
import { type PremiumOnboardingFormState, type PremiumOnboardingVariant } from "@/lib/onboarding/premium-onboarding.types";
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

type VisibilityOption = {
  value: "VISIBLE" | "MATCHES_ONLY" | "HIDDEN";
  label: string;
};

type IntentOption = {
  value: string;
  label: string;
};

type Props = {
  stepKey: DiscoveryStepKey;
  variant: PremiumOnboardingVariant;
  dark: boolean;
  form: PremiumOnboardingFormState;
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
  rootsVisibility: readonly VisibilityOption[];
  onCurrentLocationAnalyticsEvent?: (event: string, payload?: Record<string, unknown>) => void;
};

export function PremiumOnboardingDiscoveryStep({
  stepKey,
  variant,
  dark,
  form,
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
  globalRegions,
  ghanaRegions,
  rootsOptions,
  tribes,
  interests,
  intents,
  religionOptions,
  rootsVisibility,
  onCurrentLocationAnalyticsEvent,
}: Props) {
  switch (stepKey) {
    case "current_location":
      return variant === "ghana" ? (
        <View style={styles.fieldBlock}>
          <Text style={styles.sectionEyebrow}>Where you are</Text>
          <Text style={styles.sectionLead}>Choose the region most connected to your life today.</Text>
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
            }}
            onAnalyticsEvent={onCurrentLocationAnalyticsEvent}
          />
        </View>
      ) : (
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Country</Text>
          <Pressable style={[styles.selectBox, errors.currentCountry && styles.inputError]} onPress={openCurrentCountryPicker}>
            <Text style={[styles.selectText, !form.currentCountry && styles.selectPlaceholder]}>
              {form.currentCountry || "Select country"}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={styles.tokens.accent.color} />
          </Pressable>
          {renderError("currentCountry")}
          <Text style={[styles.fieldLabel, styles.spacedLabel]}>Region</Text>
          <View style={styles.chipWrap}>
            {globalRegions.map((region) =>
              renderChoice(region, form.region === region, () => {
                onCurrentLocationAnalyticsEvent?.("region_selected", { region });
                setOption("region", region);
              }),
            )}
          </View>
          {renderError("region")}
        </View>
      );
    case "roots":
      return variant === "ghana" ? (
        <View style={styles.fieldBlock}>
          <View style={styles.chipWrap}>
            {rootsOptions.map((root) => renderChoice(root, form.roots.includes(root), () => toggleRoot(root)))}
          </View>
          {renderError("roots")}
          <TextInput
            value={form.rootsNote}
            onChangeText={(text) => updateForm("rootsNote", text)}
            placeholder="Tell us more, optional"
            placeholderTextColor={styles.tokens.muted.color}
            style={[styles.input, styles.inlineInput, errors.rootsNote && styles.inputError]}
          />
          {renderError("rootsNote")}
          <Text style={[styles.fieldLabel, styles.spacedLabel]}>Who can see this?</Text>
          <View style={styles.stackChoices}>
            {rootsVisibility.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.storyOption, form.rootsVisibility === option.value && styles.storyOptionSelected]}
                onPress={() => setOption("rootsVisibility", option.value)}
              >
                <Text style={[styles.storyOptionText, form.rootsVisibility === option.value && styles.storyOptionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Origin country, optional</Text>
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
          <View style={styles.chipWrap}>
            {religionOptions.map((option) =>
              renderChoice(option.label, form.religion === option.label, () => setOption("religion", option.label)),
            )}
          </View>
          <View style={styles.privacyNote}>
            <MaterialCommunityIcons name="lock-outline" size={16} color={styles.tokens.muted.color} />
            <Text style={styles.privacyText}>You can change what is visible on your profile anytime.</Text>
          </View>
          {renderError("religion")}
        </View>
      );
    case "interests":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.interestIllustrationWrap}>
            <AnimatedLifestyleOrbit size={responsiveCompact ? 158 : 186} decorative />
          </View>
          <View style={styles.chipWrap}>
            {interests.map((interest) => renderChoice(interest, form.interests.includes(interest), () => toggleInterest(interest)))}
          </View>
          {renderError("interests")}
        </View>
      );
    case "relationship_intent":
      return (
        <View style={styles.stackChoices}>
          {intents.map((intent) => (
            <Pressable
              key={intent.value}
              style={[styles.storyOption, form.lookingFor === intent.value && styles.storyOptionSelected]}
              onPress={() => setOption("lookingFor", intent.value)}
            >
              <Text style={[styles.storyOptionText, form.lookingFor === intent.value && styles.storyOptionTextSelected]}>
                {intent.label}
              </Text>
              <MaterialCommunityIcons
                name={form.lookingFor === intent.value ? "radiobox-marked" : "radiobox-blank"}
                size={18}
                color={form.lookingFor === intent.value ? styles.tokens.accent.color : styles.tokens.muted.color}
              />
            </Pressable>
          ))}
          {renderError("lookingFor")}
        </View>
      );
    case "dating_preferences":
      return (
        <View style={styles.rangeCard}>
          <Text style={styles.ageRangeValue}>
            {form.minAgeInterest} - {form.maxAgeInterest}
          </Text>
          <View style={styles.rangeInputs}>
            <TextInput
              value={form.minAgeInterest}
              onChangeText={(text) => updateForm("minAgeInterest", text.replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
              style={[styles.ageInput, errors.minAgeInterest && styles.inputError]}
              accessibilityLabel="Minimum preferred age"
            />
            <View style={styles.rangeLine} />
            <TextInput
              value={form.maxAgeInterest}
              onChangeText={(text) => updateForm("maxAgeInterest", text.replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
              style={[styles.ageInput, errors.maxAgeInterest && styles.inputError]}
              accessibilityLabel="Maximum preferred age"
            />
          </View>
          <View style={styles.mockSlider}>
            <View style={styles.mockSliderFill} />
            <View style={[styles.sliderThumb, { left: "20%" }]} />
            <View style={[styles.sliderThumb, { right: "22%" }]} />
          </View>
          {renderError("minAgeInterest")}
          {renderError("maxAgeInterest")}
        </View>
      );
    default:
      return null;
  }
}
