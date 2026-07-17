import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { type ComponentProps } from "react";
import { Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { RECOVERY_PROVIDER_ICONS, RECOVERY_PROVIDER_LABELS } from "@/lib/profile/me-screen-config";

type Theme = typeof Colors.light;

type IdentitySuccessSheet = {
  provider: "google" | "apple";
  title: string;
  body: string;
} | null;

type RecoveryStrength = {
  label: string;
  body: string;
  tone: string;
};

type Props = {
  visible: boolean;
  theme: Theme;
  userEmail?: string | null;
  accountNetworkReady: boolean;
  emailInput: string;
  emailSaving: boolean;
  emailMessage: string;
  emailError: string;
  identitySuccessSheet: IdentitySuccessSheet;
  recoveryStrength: RecoveryStrength;
  recoveryMethodPills: string[];
  linkedProviders: string[];
  disconnectedProviders: string[];
  identitiesLoading: boolean;
  linkingProvider: string | null;
  unlinkingProvider: string | null;
  hasPasswordBackup: boolean;
  showPasswordBackupEditor: boolean;
  passwordBackupInput: string;
  passwordBackupConfirm: string;
  passwordBackupSaving: boolean;
  passwordBackupMessage: string;
  passwordBackupError: string;
  identityError: string;
  identityMessage: string;
  onClose: () => void;
  onChangeEmailInput: (value: string) => void;
  onSubmitEmail: () => void;
  onDismissIdentitySuccess: () => void;
  onReconnectProvider: (provider: "google" | "apple") => void;
  onUnlinkProvider: (provider: "google" | "apple") => void;
  onLinkGoogle: () => void;
  onLinkApple: () => void;
  onTogglePasswordBackupEditor: () => void;
  onChangePasswordBackupInput: (value: string) => void;
  onChangePasswordBackupConfirm: (value: string) => void;
  onSavePasswordBackup: () => void;
  onOpenRecoveryRequest: () => void;
  onOpenDeleteAccount: () => void;
  styles: any;
};

export default function MeEmailAccountSheet({
  visible,
  theme,
  userEmail,
  accountNetworkReady,
  emailInput,
  emailSaving,
  emailMessage,
  emailError,
  identitySuccessSheet,
  recoveryStrength,
  recoveryMethodPills,
  linkedProviders,
  disconnectedProviders,
  identitiesLoading,
  linkingProvider,
  unlinkingProvider,
  hasPasswordBackup,
  showPasswordBackupEditor,
  passwordBackupInput,
  passwordBackupConfirm,
  passwordBackupSaving,
  passwordBackupMessage,
  passwordBackupError,
  identityError,
  identityMessage,
  onClose,
  onChangeEmailInput,
  onSubmitEmail,
  onDismissIdentitySuccess,
  onReconnectProvider,
  onUnlinkProvider,
  onLinkGoogle,
  onLinkApple,
  onTogglePasswordBackupEditor,
  onChangePasswordBackupInput,
  onChangePasswordBackupConfirm,
  onSavePasswordBackup,
  onOpenRecoveryRequest,
  onOpenDeleteAccount,
  styles,
}: Props) {
  const busy = identitiesLoading || linkingProvider !== null || unlinkingProvider !== null || !accountNetworkReady;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.emailModalBackdrop}>
        <View
          style={[
            styles.emailModalCard,
            styles.deleteModalCard,
            styles.cardShadow,
            { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
          ]}
        >
          <View style={styles.emailModalHeader}>
            <Text style={[styles.emailModalTitle, { color: theme.text }]}>Email & Account</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.emailModalScroll}
            contentContainerStyle={styles.emailModalScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!accountNetworkReady ? (
              <View style={[styles.accountOfflineNotice, { backgroundColor: `${theme.tint}12`, borderColor: `${theme.tint}33` }]}>
                <MaterialCommunityIcons name="wifi-off" size={16} color={theme.tint} />
                <Text style={[styles.accountOfflineNoticeText, { color: theme.text }]}>
                  Account state is readable offline. Security actions need a live connection before they can continue.
                </Text>
              </View>
            ) : null}
            <Text style={[styles.emailModalBody, { color: theme.textMuted }]}>
              Update the email you use to sign in. We&apos;ll send a confirmation link to your new email.
            </Text>
            <TextInput
              value={emailInput}
              onChangeText={onChangeEmailInput}
              placeholder="you@example.com"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.emailInput,
                { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
              ]}
            />
            {emailError ? (
              <Text style={[styles.emailError, { color: "#ef4444" }]}>{emailError}</Text>
            ) : null}
            {emailMessage ? (
              <Text style={[styles.emailMessage, { color: theme.tint }]}>{emailMessage}</Text>
            ) : null}
            <TouchableOpacity
              style={[
                styles.emailSaveButton,
                { backgroundColor: theme.tint, opacity: emailSaving || !accountNetworkReady ? 0.6 : 1 },
              ]}
              onPress={onSubmitEmail}
              disabled={emailSaving || !accountNetworkReady}
            >
              <Text style={styles.emailSaveText}>
                {emailSaving ? "Sending..." : accountNetworkReady ? "Send confirmation" : "Requires connection"}
              </Text>
            </TouchableOpacity>
            <View style={[styles.emailAccountDivider, { backgroundColor: theme.outline }]} />
            {identitySuccessSheet ? (
              <View style={[styles.identitySuccessInlineCard, { backgroundColor: theme.background, borderColor: `${theme.tint}33` }]}>
                <LinearGradient
                  colors={[`${theme.tint}20`, `${theme.accent}14`, "transparent"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.identitySuccessInlineGlow}
                  pointerEvents="none"
                />
                <View style={styles.identitySuccessInlineHeader}>
                  <View style={[styles.identitySuccessInlineIconHalo, { backgroundColor: `${theme.tint}18`, borderColor: `${theme.tint}40` }]}>
                    <LinearGradient
                      colors={[theme.tint, theme.accent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.identitySuccessInlineIconCore}
                    >
                      <MaterialCommunityIcons
                        name={identitySuccessSheet.provider === "google" ? "google" : "apple"}
                        size={20}
                        color="#FFFFFF"
                      />
                    </LinearGradient>
                  </View>
                  <TouchableOpacity
                    onPress={onDismissIdentitySuccess}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.identitySuccessInlineEyebrow, { color: theme.tint }]}>SIGN-IN METHOD SECURED</Text>
                <Text style={[styles.identitySuccessInlineTitle, { color: theme.text }]}>
                  {identitySuccessSheet.title}
                </Text>
                <Text style={[styles.identitySuccessInlineBody, { color: theme.textMuted }]}>
                  {identitySuccessSheet.body}
                </Text>
              </View>
            ) : null}
            <View style={styles.identitySection}>
              <Text style={[styles.identitySectionTitle, { color: theme.text }]}>Linked sign-in methods</Text>
              <Text style={[styles.identitySectionBody, { color: theme.textMuted }]}>
                Keep one primary sign-in route and at least one backup route so Betweener can always restore the right account.
              </Text>

              <View
                style={[
                  styles.recoveryStrengthCard,
                  { backgroundColor: theme.background, borderColor: theme.outline },
                ]}
              >
                <View style={styles.recoveryStrengthHeader}>
                  <View style={styles.recoveryStrengthCopy}>
                    <Text style={[styles.recoveryStrengthTitle, { color: theme.text }]}>Recovery strength</Text>
                    <Text style={[styles.recoveryStrengthBody, { color: theme.textMuted }]}>
                      {recoveryStrength.body}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.recoveryStrengthPill,
                      { backgroundColor: `${recoveryStrength.tone}14`, borderColor: `${recoveryStrength.tone}33` },
                    ]}
                  >
                    <Text style={[styles.recoveryStrengthPillText, { color: recoveryStrength.tone }]}>
                      {recoveryStrength.label}
                    </Text>
                  </View>
                </View>
                <View style={styles.recoveryStrengthMethods}>
                  {recoveryMethodPills.map((method) => (
                    <View
                      key={method}
                      style={[
                        styles.recoveryStrengthMethodPill,
                        { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          (RECOVERY_PROVIDER_ICONS[method] as ComponentProps<
                            typeof MaterialCommunityIcons
                          >["name"]) ?? "shield-check-outline"
                        }
                        size={13}
                        color={theme.tint}
                      />
                      <Text style={[styles.recoveryStrengthMethodText, { color: theme.text }]}>
                        {RECOVERY_PROVIDER_LABELS[method] ?? method}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View
                style={[
                  styles.identityMethodCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <View style={styles.identityMethodMeta}>
                  <View style={[styles.identityMethodIcon, { backgroundColor: theme.background }]}>
                    <MaterialCommunityIcons name="email-outline" size={18} color={theme.tint} />
                  </View>
                  <View style={styles.identityMethodTextWrap}>
                    <Text style={[styles.identityMethodTitle, { color: theme.text }]}>Email</Text>
                    <Text style={[styles.identityMethodSubtitle, { color: theme.textMuted }]}>
                      {userEmail || "No email on file"}
                    </Text>
                  </View>
                </View>
                <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + "18", borderColor: theme.tint }]}>
                  <Text style={[styles.identityStatusText, { color: theme.tint }]}>Primary</Text>
                </View>
              </View>

              <View
                style={[
                  styles.identityMethodCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <View style={styles.identityMethodMeta}>
                  <View style={[styles.identityMethodIcon, { backgroundColor: theme.background }]}>
                    <MaterialCommunityIcons name="google" size={18} color="#EA4335" />
                  </View>
                  <View style={styles.identityMethodTextWrap}>
                    <Text style={[styles.identityMethodTitle, { color: theme.text }]}>Google</Text>
                    <Text style={[styles.identityMethodSubtitle, { color: theme.textMuted }]}>
                      {disconnectedProviders.includes("google")
                        ? "Disconnected for Betweener"
                        : linkedProviders.includes("google")
                          ? "Linked to this account"
                          : "Not linked yet"}
                    </Text>
                  </View>
                </View>
                {disconnectedProviders.includes("google") ? (
                  <View style={styles.identityActions}>
                    <View style={[styles.identityStatusPill, { backgroundColor: "#ef444418", borderColor: "#ef4444" }]}>
                      <Text style={[styles.identityStatusText, { color: "#ef4444" }]}>Disconnected</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => onReconnectProvider("google")}
                      disabled={busy}
                      style={[
                        styles.identityLinkButton,
                        {
                          backgroundColor: theme.tint,
                          opacity: busy ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.identityLinkButtonText}>
                        {linkingProvider === "google" ? "Reconnecting..." : accountNetworkReady ? "Reconnect" : "Requires connection"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : linkedProviders.includes("google") ? (
                  <View style={styles.identityActions}>
                    <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + "18", borderColor: theme.tint }]}>
                      <Text style={[styles.identityStatusText, { color: theme.tint }]}>Linked</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => onUnlinkProvider("google")}
                      disabled={busy}
                      style={[
                        styles.identityUnlinkButton,
                        {
                          borderColor: "#ef4444",
                          opacity: busy ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.identityUnlinkButtonText}>
                        {unlinkingProvider === "google" ? "Disconnecting..." : accountNetworkReady ? "Disconnect" : "Requires connection"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={onLinkGoogle}
                    disabled={busy}
                    style={[
                      styles.identityLinkButton,
                      {
                        backgroundColor: theme.tint,
                        opacity: busy ? 0.65 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.identityLinkButtonText}>
                      {linkingProvider === "google" ? "Linking..." : accountNetworkReady ? "Link Google" : "Requires connection"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {Platform.OS === "ios" ? (
                <View
                  style={[
                    styles.identityMethodCard,
                    { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                  ]}
                >
                  <View style={styles.identityMethodMeta}>
                    <View style={[styles.identityMethodIcon, { backgroundColor: theme.background }]}>
                      <MaterialCommunityIcons name="apple" size={18} color={theme.text} />
                    </View>
                    <View style={styles.identityMethodTextWrap}>
                      <Text style={[styles.identityMethodTitle, { color: theme.text }]}>Apple</Text>
                      <Text style={[styles.identityMethodSubtitle, { color: theme.textMuted }]}>
                        {disconnectedProviders.includes("apple")
                          ? "Disconnected for Betweener"
                          : linkedProviders.includes("apple")
                            ? "Linked to this account"
                            : "Not linked yet"}
                      </Text>
                    </View>
                  </View>
                  {disconnectedProviders.includes("apple") ? (
                    <View style={styles.identityActions}>
                      <View style={[styles.identityStatusPill, { backgroundColor: "#ef444418", borderColor: "#ef4444" }]}>
                        <Text style={[styles.identityStatusText, { color: "#ef4444" }]}>Disconnected</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => onReconnectProvider("apple")}
                        disabled={busy}
                        style={[
                          styles.identityLinkButton,
                          {
                            backgroundColor: theme.tint,
                            opacity: busy ? 0.65 : 1,
                          },
                        ]}
                      >
                        <Text style={styles.identityLinkButtonText}>
                          {linkingProvider === "apple" ? "Reconnecting..." : accountNetworkReady ? "Reconnect" : "Requires connection"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : linkedProviders.includes("apple") ? (
                    <View style={styles.identityActions}>
                      <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + "18", borderColor: theme.tint }]}>
                        <Text style={[styles.identityStatusText, { color: theme.tint }]}>Linked</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => onUnlinkProvider("apple")}
                        disabled={busy}
                        style={[
                          styles.identityUnlinkButton,
                          {
                            borderColor: "#ef4444",
                            opacity: busy ? 0.6 : 1,
                          },
                        ]}
                      >
                        <Text style={styles.identityUnlinkButtonText}>
                          {unlinkingProvider === "apple" ? "Disconnecting..." : accountNetworkReady ? "Disconnect" : "Requires connection"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={onLinkApple}
                      disabled={busy}
                      style={[
                        styles.identityLinkButton,
                        {
                          backgroundColor: theme.tint,
                          opacity: busy ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.identityLinkButtonText}>
                        {linkingProvider === "apple" ? "Linking..." : accountNetworkReady ? "Link Apple" : "Requires connection"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              <Text style={[styles.identitySupportText, { color: theme.textMuted }]}>
                Disconnect Google or Apple here any time, as long as another sign-in method or password backup remains on the account.
              </Text>

              <View
                style={[
                  styles.passwordBackupCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <View style={styles.recoveryCardCopy}>
                  <View style={styles.passwordBackupTitleRow}>
                    <Text style={[styles.recoveryCardTitle, { color: theme.text }]}>Password backup</Text>
                    {hasPasswordBackup ? (
                      <View style={[styles.identityStatusPill, { backgroundColor: theme.tint + "18", borderColor: theme.tint }]}>
                        <Text style={[styles.identityStatusText, { color: theme.tint }]}>Ready</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.recoveryCardBody, { color: theme.textMuted }]}>
                    {hasPasswordBackup
                      ? "A password-based recovery route is already attached to this account. Refresh it any time you want a stronger fallback."
                      : "Set a private backup password so email can restore this account even if Apple or Google opens the wrong profile first."}
                  </Text>
                </View>
                <View style={styles.passwordBackupActions}>
                  <TouchableOpacity
                    onPress={onTogglePasswordBackupEditor}
                    style={[
                      styles.passwordBackupSecondaryButton,
                      { borderColor: theme.outline, backgroundColor: theme.background },
                    ]}
                  >
                    <Text style={[styles.passwordBackupSecondaryText, { color: theme.text }]}>
                      {showPasswordBackupEditor
                        ? "Hide password setup"
                        : hasPasswordBackup
                          ? "Refresh password backup"
                          : "Set up password backup"}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showPasswordBackupEditor ? (
                  <View style={styles.passwordBackupEditor}>
                    <TextInput
                      value={passwordBackupInput}
                      onChangeText={onChangePasswordBackupInput}
                      placeholder="Create backup password"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      style={[
                        styles.emailInput,
                        { color: theme.text, borderColor: theme.outline, backgroundColor: theme.background },
                      ]}
                    />
                    <TextInput
                      value={passwordBackupConfirm}
                      onChangeText={onChangePasswordBackupConfirm}
                      placeholder="Confirm backup password"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      style={[
                        styles.emailInput,
                        { color: theme.text, borderColor: theme.outline, backgroundColor: theme.background },
                      ]}
                    />
                    {passwordBackupError ? (
                      <Text style={[styles.identityError, { color: "#ef4444" }]}>{passwordBackupError}</Text>
                    ) : null}
                    {passwordBackupMessage ? (
                      <Text style={[styles.identityMessage, { color: theme.tint }]}>{passwordBackupMessage}</Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={onSavePasswordBackup}
                      disabled={passwordBackupSaving || !userEmail || !accountNetworkReady}
                      style={[
                        styles.passwordBackupButton,
                        { backgroundColor: theme.tint, opacity: passwordBackupSaving || !userEmail || !accountNetworkReady ? 0.65 : 1 },
                      ]}
                    >
                      <Text style={styles.identityLinkButtonText}>
                        {passwordBackupSaving ? "Saving..." : accountNetworkReady ? "Save password backup" : "Requires connection"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : passwordBackupMessage ? (
                  <Text style={[styles.identityMessage, { color: theme.tint }]}>{passwordBackupMessage}</Text>
                ) : null}
              </View>

              {identityError ? (
                <Text style={[styles.identityError, { color: "#ef4444" }]}>{identityError}</Text>
              ) : null}
              {identityMessage ? (
                <Text style={[styles.identityMessage, { color: theme.tint }]}>{identityMessage}</Text>
              ) : null}
              {identitiesLoading ? (
                <Text style={[styles.identityLoading, { color: theme.textMuted }]}>Checking sign-in methods...</Text>
              ) : null}

              <View style={[styles.recoveryCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                <View style={styles.recoveryCardCopy}>
                  <Text style={[styles.recoveryCardTitle, { color: theme.text }]}>Having trouble with another sign-in method?</Text>
                  <Text style={[styles.recoveryCardBody, { color: theme.textMuted }]}>
                    If Apple, Google, or email still opens the wrong Betweener account, the automatic recovery flow will try first. This support request stays here as the final safety net.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onOpenRecoveryRequest}
                  disabled={!accountNetworkReady}
                  style={[styles.recoveryCardButton, { backgroundColor: theme.tint, opacity: accountNetworkReady ? 1 : 0.65 }]}
                >
                  <Text style={styles.recoveryCardButtonText}>
                    {accountNetworkReady ? "Recover account access" : "Requires connection"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.accountDeletionCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                <View style={styles.accountDeletionHeaderRow}>
                  <View style={styles.accountDeletionCopy}>
                    <Text style={[styles.recoveryCardTitle, { color: theme.text }]}>Leave Betweener</Text>
                    <Text style={[styles.recoveryCardBody, { color: theme.textMuted }]}>
                      Tell us why you are leaving, then choose whether to step back or close this account permanently.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onOpenDeleteAccount}
                    disabled={!accountNetworkReady}
                    style={[styles.accountDeletionButton, { borderColor: "#ef4444", backgroundColor: theme.background, opacity: accountNetworkReady ? 1 : 0.6 }]}
                  >
                    <Text style={styles.accountDeletionButtonText}>{accountNetworkReady ? "Leave now" : "Requires connection"}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.accountDeletionFootnote, { color: theme.textMuted }]}>
                  We&apos;ll offer calmer options before anything is closed permanently.
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
