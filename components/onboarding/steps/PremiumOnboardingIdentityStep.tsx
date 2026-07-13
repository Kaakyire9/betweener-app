import { AnimatedAboutIdentity } from "@/components/onboarding/AnimatedAboutIdentity";
import { AnimatedBioExpression } from "@/components/onboarding/AnimatedBioExpression";
import { AnimatedIdentityCard } from "@/components/onboarding/AnimatedIdentityCard";
import { AnimatedOccupationOrbit } from "@/components/onboarding/AnimatedOccupationOrbit";
import { AnimatedPhotoPortrait } from "@/components/onboarding/AnimatedPhotoPortrait";
import { PremiumOccupationSelector } from "@/components/onboarding/steps/PremiumOccupationSelector";
import { type PremiumOnboardingFormState } from "@/lib/onboarding/premium-onboarding.types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";

type IdentityStepKey = "name" | "about" | "occupation" | "bio" | "photo";

type Props = {
  stepKey: IdentityStepKey;
  form: PremiumOnboardingFormState;
  customOccupation: string;
  image: string | null;
  errors: Record<string, string>;
  styles: any;
  responsiveCompact: boolean;
  dark: boolean;
  setCustomOccupation: (value: string) => void;
  updateForm: <K extends keyof PremiumOnboardingFormState>(key: K, value: PremiumOnboardingFormState[K]) => void;
  setOption: <K extends keyof PremiumOnboardingFormState>(key: K, value: PremiumOnboardingFormState[K]) => void;
  pickImage: () => void;
  renderError: (key: string) => ReactNode;
  renderChoice: (label: string, selected: boolean, onPress: () => void, icon?: string) => ReactNode;
  occupations: readonly string[];
};

export function PremiumOnboardingIdentityStep({
  stepKey,
  form,
  customOccupation,
  image,
  errors,
  styles,
  responsiveCompact,
  dark,
  setCustomOccupation,
  updateForm,
  setOption,
  pickImage,
  renderError,
  renderChoice,
  occupations,
}: Props) {
  switch (stepKey) {
    case "name":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.identityIllustrationWrap}>
            <AnimatedIdentityCard size={responsiveCompact ? 148 : 196} decorative personalized={form.fullName.trim().length >= 2} />
          </View>
          <TextInput
            value={form.fullName}
            onChangeText={(text) => updateForm("fullName", text)}
            placeholder="Nana Akua"
            placeholderTextColor={styles.tokens.muted.color}
            style={[styles.input, errors.fullName && styles.inputError]}
          />
          {renderError("fullName")}
        </View>
      );
    case "about":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.aboutIllustrationWrap}>
            <AnimatedAboutIdentity size={responsiveCompact ? 142 : 186} decorative selected={!!form.age && !!form.gender} />
          </View>
          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput
            value={form.age}
            onChangeText={(text) => updateForm("age", text.replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
            placeholder="27"
            placeholderTextColor={styles.tokens.muted.color}
            style={[styles.input, errors.age && styles.inputError]}
          />
          {renderError("age")}
          <Text style={[styles.fieldLabel, styles.spacedLabel]}>Gender</Text>
          <View style={styles.chipWrap}>
            {renderChoice("Woman", form.gender === "FEMALE", () => setOption("gender", "FEMALE"))}
            {renderChoice("Man", form.gender === "MALE", () => setOption("gender", "MALE"))}
            {renderChoice("Other", form.gender === "OTHER", () => setOption("gender", "OTHER"))}
          </View>
          {renderError("gender")}
        </View>
      );
    case "occupation":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.occupationIllustrationWrap}>
            <AnimatedOccupationOrbit size={responsiveCompact ? 158 : 214} decorative selected={!!form.occupation} />
          </View>
          <PremiumOccupationSelector
            occupations={occupations}
            selectedOccupation={form.occupation}
            customOccupation={customOccupation}
            error={errors.occupation}
            styles={styles}
            onSelect={(occupation) => {
              setOption("occupation", occupation);
              setCustomOccupation("");
            }}
            onSelectCustom={(occupation) => {
              setCustomOccupation(occupation);
              setOption("occupation", "Other");
            }}
          />
          {renderError("occupation")}
        </View>
      );
    case "bio":
      return (
        <View style={styles.fieldBlock}>
          <View style={styles.bioIllustrationWrap}>
            <AnimatedBioExpression size={responsiveCompact ? 146 : 194} decorative progress={form.bio.length / 300} />
          </View>
          <TextInput
            value={form.bio}
            onChangeText={(text) => updateForm("bio", text.slice(0, 300))}
            placeholder="A good weekend, something you care about, or what people notice about you..."
            placeholderTextColor={styles.tokens.muted.color}
            style={[styles.textArea, errors.bio && styles.inputError]}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{form.bio.length}/300</Text>
          {renderError("bio")}
        </View>
      );
    case "photo":
      return (
        <View style={styles.photoBlock}>
          <View style={styles.photoIllustrationWrap}>
            <AnimatedPhotoPortrait
              size={responsiveCompact ? (image ? 178 : 192) : image ? 238 : 258}
              decorative
              settled={!!image}
            />
          </View>
          <Text style={styles.photoSupportText}>
            {image ? "This is the face people will anchor on first." : "Lead with a clear portrait people can trust instantly."}
          </Text>
          <Pressable style={[styles.photoFrame, image && styles.photoFrameSelected]} onPress={pickImage}>
            {image ? (
              <Image source={{ uri: image }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <MaterialCommunityIcons name="camera-plus-outline" size={34} color={styles.tokens.accent.color} />
                <Text style={styles.photoPlaceholderText}>Add photo</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <MaterialCommunityIcons name="camera" size={18} color={dark ? "#071E22" : "#FFFFFF"} />
            </View>
          </Pressable>
          <Pressable onPress={pickImage}>
            <Text style={styles.changePhotoText}>{image ? "Refine photo" : "Choose photo"}</Text>
          </Pressable>
          {image ? (
            <View style={styles.photoStatusPill}>
              <MaterialCommunityIcons name="check-circle" size={14} color={styles.tokens.accent.color} />
              <Text style={styles.photoStatusText}>Portrait selected</Text>
            </View>
          ) : null}
          {renderError("profilePic")}
        </View>
      );
    default:
      return null;
  }
}
