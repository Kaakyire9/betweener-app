import { AuthDebugPanel } from "@/components/auth-debug";
import { Stepper } from "@/components/Stepper";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const REGIONS = ["Greater Accra", "Ashanti", "Volta", "Central"];
const TRIBES = ["Akan", "Ewe", "Ga-Adangbe", "Mole-Dagbani"];
const RELIGIONS = ["Christian", "Muslim", "Traditionalist", "Other"];
const INTERESTS = [
  "Afrobeats",
  "Football",
  "Jollof",
  "Church",
  "Kumawood Movies",
];

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile, user, signOut } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    age: "",
    gender: "",
    bio: "",
    region: "",
    tribe: "",
    religion: "",
    interests: [] as string[],
    minAgeInterest: "18",
    maxAgeInterest: "35",
  });

  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const manipulatedImage = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 500, height: 500 } }],
          { compress: 0.8, format: SaveFormat.JPEG }
        );
        setImage(manipulatedImage.uri);
        setErrors((prev) => ({ ...prev, profilePic: "" }));
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!form.fullName.trim()) newErrors.fullName = "Full name is required.";
    if (!form.age || Number(form.age) < 18) newErrors.age = "You must be at least 18.";
    if (!form.gender) newErrors.gender = "Gender is required.";
    if (!form.bio.trim()) newErrors.bio = "Bio is required.";
    if (!form.region) newErrors.region = "Region is required.";
    if (!form.tribe) newErrors.tribe = "Tribe is required.";
    if (!form.religion) newErrors.religion = "Religion is required.";
    if (form.interests.length === 0) newErrors.interests = "Select at least one interest.";
    if (!image) newErrors.profilePic = "Profile picture is required.";

    const minAge = Number(form.minAgeInterest);
    const maxAge = Number(form.maxAgeInterest);
    if (minAge < 18 || minAge > 99) newErrors.minAgeInterest = "Min age must be between 18 and 99.";
    if (maxAge < 18 || maxAge > 99) newErrors.maxAgeInterest = "Max age must be between 18 and 99.";
    if (minAge > maxAge) newErrors.maxAgeInterest = "Max age must be greater than or equal to min age.";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    setMessage("");

    try {
      console.log("Starting profile creation...");
      console.log("User from context:", user?.id, user?.email);

      // 1. Check if user is available from auth context
      if (!user) {
        throw new Error("User not authenticated. Please log in again.");
      }

      let imageUrl = null;

      // 2. Upload image
      if (image) {
        console.log("Uploading image...");
        const fileExt = image.split(".").pop() || "jpg";
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

        // Read file as array buffer for React Native
        const response = await fetch(image);
        const arrayBuffer = await response.arrayBuffer();
        const fileBody = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from("profiles")
          .upload(fileName, fileBody, {
            contentType: `image/${fileExt}`,
          });

        if (uploadError) {
          console.error("Image upload error:", uploadError);
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        const { data } = supabase.storage.from("profiles").getPublicUrl(fileName);
        imageUrl = data.publicUrl;
        console.log("Image uploaded successfully:", imageUrl);
      }

      // 3. Create/update profile using auth context
      console.log("Creating profile...");
      const profileData = {
        id: user.id,
        user_id: user.id,
        full_name: form.fullName,
        age: Number(form.age),
        gender: form.gender.toUpperCase(),
        bio: form.bio,
        region: form.region,
        tribe: form.tribe,
        religion: form.religion.toUpperCase(),
        avatar_url: imageUrl,
        min_age_interest: Number(form.minAgeInterest),
        max_age_interest: Number(form.maxAgeInterest),
      };

      console.log("Profile data:", profileData);

      const { error: updateError } = await updateProfile(profileData);

      if (updateError) {
        console.error("Profile update error:", updateError);
        throw new Error(`Profile creation failed: ${updateError.message}`);
      }

      console.log("Profile created successfully!");
      setMessage("Profile saved! Redirecting...");
      // No need to manually navigate - AuthGuard will handle routing
    } catch (error: any) {
      console.error("Onboarding error:", error);
      setMessage(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out? You'll need to log in again to complete your profile.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
              router.replace("/(auth)/login");
            } catch (error) {
              console.error("Sign out error:", error);
              Alert.alert("Error", "Failed to sign out. Please try again.");
            }
          },
        },
      ]
    );
  };

  // Step logic: 0 = Profile, 1 = Details, 2 = Photo, 3 = Finish
  let currentStep = 0;
  if (image) currentStep = 2;
  else if (
    form.fullName &&
    form.age &&
    form.gender &&
    form.bio &&
    form.region &&
    form.tribe &&
    form.religion &&
    form.interests.length > 0
  )
    currentStep = 1;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <AuthDebugPanel />
            
            {/* Header with Sign Out */}
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text style={styles.title}>Welcome to Betweener!</Text>
                <Text style={styles.subtitle}>Let's create your profile</Text>
              </View>
              <Pressable
                onPress={handleSignOut}
                style={styles.signOutButton}
                accessibilityLabel="Sign out and restart signup"
              >
                <MaterialCommunityIcons name="logout" size={20} color="#ef4444" />
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            </View>
            
            <Stepper
              steps={["Profile", "Details", "Photo", "Finish"]}
              currentStep={currentStep}
            />
            
            {/* Debug info - remove in production */}
            {__DEV__ && (
              <Text style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 16 }}>
                Debug: User ID: {user?.id || 'Not found'} | Email: {user?.email || 'Not found'}
              </Text>
            )}

            {/* Profile Image */}
            <TouchableOpacity
              onPress={pickImage}
              style={styles.imageContainer}
              accessibilityLabel="Pick profile image"
            >
              <View style={styles.avatar}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.avatarImage} />
                ) : (
                  <MaterialCommunityIcons
                    name="camera-plus-outline"
                    size={32}
                    color="#666"
                  />
                )}
              </View>
              <Text style={styles.imageText}>
                {image ? "Change Photo" : "Upload Photo"}
              </Text>
              {errors.profilePic && (
                <Text style={styles.errorText}>{errors.profilePic}</Text>
              )}
            </TouchableOpacity>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.inputRow}>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      errors.fullName && styles.inputError,
                      { fontFamily: "Manrope_400Regular" },
                    ]}
                    value={form.fullName}
                    onChangeText={(text) =>
                      setForm((prev) => ({ ...prev, fullName: text }))
                    }
                    placeholder="Enter your full name"
                  />
                  {errors.fullName && (
                    <Text style={styles.errorText}>{errors.fullName}</Text>
                  )}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Age</Text>
                  <TextInput
                    style={[
                      styles.input,
                      errors.age && styles.inputError,
                      { fontFamily: "Manrope_400Regular" },
                    ]}
                    value={form.age}
                    onChangeText={(text) =>
                      setForm((prev) => ({ ...prev, age: text }))
                    }
                    placeholder="Age"
                    keyboardType="numeric"
                  />
                  {errors.age && (
                    <Text style={styles.errorText}>{errors.age}</Text>
                  )}
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Gender</Text>
                <View style={styles.selectContainer}>
                  {["Male", "Female", "Other"].map((gender) => (
                    <TouchableOpacity
                      key={gender}
                      style={[
                        styles.genderOption,
                        form.gender === gender && styles.genderOptionSelected,
                      ]}
                      onPress={() =>
                        setForm((prev) => ({ ...prev, gender }))
                      }
                      accessibilityLabel={`Select gender ${gender}`}
                    >
                      <Text
                        style={[
                          styles.genderText,
                          form.gender === gender && styles.genderTextSelected,
                          { fontFamily: "Manrope_400Regular" },
                        ]}
                      >
                        {gender}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.gender && (
                  <Text style={styles.errorText}>{errors.gender}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    errors.bio && styles.inputError,
                    { fontFamily: "Manrope_400Regular" },
                  ]}
                  value={form.bio}
                  onChangeText={(text) =>
                    setForm((prev) => ({ ...prev, bio: text }))
                  }
                  placeholder="Tell us about yourself"
                  multiline
                  numberOfLines={3}
                />
                {errors.bio && (
                  <Text style={styles.errorText}>{errors.bio}</Text>
                )}
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Region</Text>
                  <ScrollView style={styles.picker} horizontal>
                    {REGIONS.map((region) => (
                      <TouchableOpacity
                        key={region}
                        style={[
                          styles.pillOption,
                          form.region === region && styles.pillOptionSelected,
                        ]}
                        onPress={() =>
                          setForm((prev) => ({ ...prev, region }))
                        }
                        accessibilityLabel={`Select region ${region}`}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            form.region === region && styles.pillTextSelected,
                            { fontFamily: "Manrope_400Regular" },
                          ]}
                        >
                          {region}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {errors.region && (
                    <Text style={styles.errorText}>{errors.region}</Text>
                  )}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Tribe</Text>
                  <ScrollView style={styles.picker} horizontal>
                    {TRIBES.map((tribe) => (
                      <TouchableOpacity
                        key={tribe}
                        style={[
                          styles.pillOption,
                          form.tribe === tribe && styles.pillOptionSelected,
                        ]}
                        onPress={() =>
                          setForm((prev) => ({ ...prev, tribe }))
                        }
                        accessibilityLabel={`Select tribe ${tribe}`}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            form.tribe === tribe && styles.pillTextSelected,
                            { fontFamily: "Manrope_400Regular" },
                          ]}
                        >
                          {tribe}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {errors.tribe && (
                    <Text style={styles.errorText}>{errors.tribe}</Text>
                  )}
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Religion</Text>
                <ScrollView style={styles.picker} horizontal>
                  {RELIGIONS.map((religion) => (
                    <TouchableOpacity
                      key={religion}
                      style={[
                        styles.pillOption,
                        form.religion === religion && styles.pillOptionSelected,
                      ]}
                      onPress={() =>
                        setForm((prev) => ({ ...prev, religion }))
                      }
                      accessibilityLabel={`Select religion ${religion}`}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          form.religion === religion && styles.pillTextSelected,
                          { fontFamily: "Manrope_400Regular" },
                        ]}
                      >
                        {religion}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {errors.religion && (
                  <Text style={styles.errorText}>{errors.religion}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Interests</Text>
                <ScrollView style={styles.interestsContainer} horizontal>
                  {INTERESTS.map((interest) => (
                    <TouchableOpacity
                      key={interest}
                      style={[
                        styles.interestPill,
                        form.interests.includes(interest) &&
                          styles.interestPillSelected,
                      ]}
                      onPress={() => toggleInterest(interest)}
                      accessibilityLabel={`Toggle interest ${interest}`}
                    >
                      <Text
                        style={[
                          styles.interestText,
                          form.interests.includes(interest) &&
                            styles.interestTextSelected,
                          { fontFamily: "Manrope_400Regular" },
                        ]}
                      >
                        {interest}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {errors.interests && (
                  <Text style={styles.errorText}>{errors.interests}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Age Preference</Text>
                <View style={styles.ageRangeContainer}>
                  <TextInput
                    style={[
                      styles.ageInput,
                      errors.minAgeInterest && styles.inputError,
                      { fontFamily: "Manrope_400Regular" },
                    ]}
                    value={form.minAgeInterest}
                    onChangeText={(text) =>
                      setForm((prev) => ({ ...prev, minAgeInterest: text }))
                    }
                    keyboardType="numeric"
                    accessibilityLabel="Minimum age preference"
                  />
                  <Text style={styles.ageRangeText}>to</Text>
                  <TextInput
                    style={[
                      styles.ageInput,
                      errors.maxAgeInterest && styles.inputError,
                      { fontFamily: "Manrope_400Regular" },
                    ]}
                    value={form.maxAgeInterest}
                    onChangeText={(text) =>
                      setForm((prev) => ({ ...prev, maxAgeInterest: text }))
                    }
                    keyboardType="numeric"
                    accessibilityLabel="Maximum age preference"
                  />
                </View>
                {(errors.minAgeInterest || errors.maxAgeInterest) && (
                  <Text style={styles.errorText}>
                    {errors.minAgeInterest || errors.maxAgeInterest}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={loading}
                accessibilityLabel="Create Profile"
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.submitButtonText,
                      { fontFamily: "Archivo_700Bold" },
                    ]}
                  >
                    Create Profile
                  </Text>
                )}
              </TouchableOpacity>

              {message ? (
                <Text style={styles.messageText}>{message}</Text>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: "Archivo_700Bold",
    textAlign: "center",
    marginBottom: 8,
    color: "#1e40af",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Manrope_400Regular",
    textAlign: "center",
    color: "#64748b",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  signOutText: {
    color: "#ef4444",
    fontSize: 14,
    fontFamily: "Manrope_600SemiBold",
    marginLeft: 4,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 3,
    borderColor: "#fff",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
  },
  imageText: {
    color: "#3b82f6",
    fontWeight: "500",
    fontFamily: "Manrope_400Regular",
  },
  form: {
    gap: 16,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputContainer: {
    flex: 1,
  },
  label: {
    fontWeight: "500",
    color: "#374151",
    marginBottom: 4,
    fontFamily: "Manrope_400Regular",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 4,
    fontFamily: "Manrope_400Regular",
  },
  selectContainer: {
    flexDirection: "row",
    gap: 8,
  },
  genderOption: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  genderOptionSelected: {
    backgroundColor: "#3b82f6",
  },
  genderText: {
    color: "#374151",
    fontWeight: "500",
  },
  genderTextSelected: {
    color: "#fff",
  },
  picker: {
    flexGrow: 0,
  },
  pillOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    marginRight: 8,
  },
  pillOptionSelected: {
    backgroundColor: "#3b82f6",
  },
  pillText: {
    color: "#374151",
  },
  pillTextSelected: {
    color: "#fff",
  },
  interestsContainer: {
    flexGrow: 0,
    marginVertical: 8,
  },
  interestPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    marginRight: 8,
  },
  interestPillSelected: {
    backgroundColor: "#3b82f6",
  },
  interestText: {
    color: "#374151",
  },
  interestTextSelected: {
    color: "#fff",
  },
  ageRangeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ageInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlign: "center",
  },
  ageRangeText: {
    color: "#64748b",
    fontWeight: "500",
    fontFamily: "Manrope_400Regular",
  },
  submitButton: {
    backgroundColor: "#3b82f6",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  messageText: {
    textAlign: "center",
    color: "#3b82f6",
    fontWeight: "500",
    marginTop: 16,
    fontFamily: "Manrope_400Regular",
  },
});