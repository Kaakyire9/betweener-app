import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { Alert, Animated } from "react-native";

import type { MessageType } from "@/components/chat/types";
import {
  consumeChatOptionsAction,
  consumeChatOptionsFeedback,
  type ChatOptionsActionPayload,
} from "@/lib/chat-options-bus";
import { fetchConversationMessageIds, insertMessageHidesBatched } from "@/lib/chat/history";
import { ChatRepository } from "@/lib/chat/local/chat-db";
import { ChatThreadRemoteService } from "@/lib/chat/chat-thread-remote-service";

type ReportReason = {
  id: string;
  label: string;
};

type UseChatThreadScreenUiArgs = {
  userId?: string | null;
  routeId: string;
  conversationId?: string | null;
  activePeerMessageUserId?: string | null;
  peerProfileId?: string | null;
  resolvedPeerProfileId?: string | null;
  peerHasLeftBetweener: boolean;
  peerHasMoment: boolean;
  isChatBlocked: boolean;
  isBlockedByMe: boolean;
  canPlanDate: boolean;
  datePlanUnlockReason: string;
  headerStatusLabel: string;
  conversationSignal?: string | null;
  userName: string;
  chatPrefsStorageKey: string;
  headerHintStorageKey: string;
  blockedByMeValue: string;
  reportReasons: readonly ReportReason[];
  showHeaderHint: boolean;
  setShowHeaderHint: Dispatch<SetStateAction<boolean>>;
  headerHintOpacity: Animated.Value;
  headerHintDismissedRef: MutableRefObject<boolean>;
  chatPrefsStateRef: MutableRefObject<{ muted: boolean; pinned: boolean }>;
  applyChatPrefsState: (nextPrefs: { muted: boolean; pinned: boolean }) => void;
  triggerChatActionToast: (label: string, icon: string) => void;
  openDatePlannerUnlocked: () => void;
  handleOpenDatePlanner: () => void;
  fetchMessages: () => Promise<void>;
  fetchHiddenMessages: () => Promise<void>;
  updateHiddenMessageIds: (ids: string[]) => void;
  setMessages: Dispatch<SetStateAction<MessageType[]>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  setOldestTimestamp: Dispatch<SetStateAction<Date | null>>;
  setBlockStatus: Dispatch<SetStateAction<string | null>>;
  setChatSearchQuery: Dispatch<SetStateAction<string>>;
};

export const useChatThreadScreenUi = ({
  userId,
  routeId,
  conversationId,
  activePeerMessageUserId,
  peerProfileId,
  resolvedPeerProfileId,
  peerHasLeftBetweener,
  peerHasMoment,
  isChatBlocked,
  isBlockedByMe,
  canPlanDate,
  datePlanUnlockReason,
  headerStatusLabel,
  conversationSignal,
  userName,
  chatPrefsStorageKey,
  headerHintStorageKey,
  blockedByMeValue,
  reportReasons,
  showHeaderHint,
  setShowHeaderHint,
  headerHintOpacity,
  headerHintDismissedRef,
  chatPrefsStateRef,
  applyChatPrefsState,
  triggerChatActionToast,
  openDatePlannerUnlocked,
  handleOpenDatePlanner,
  fetchMessages,
  fetchHiddenMessages,
  updateHiddenMessageIds,
  setMessages,
  setHasMore,
  setOldestTimestamp,
  setBlockStatus,
  setChatSearchQuery,
}: UseChatThreadScreenUiArgs) => {
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReasonId, setReportReasonId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportShouldBlock, setReportShouldBlock] = useState(false);
  const [reportEvidenceMessage, setReportEvidenceMessage] = useState<MessageType | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [momentViewerVisible, setMomentViewerVisible] = useState(false);
  const [momentViewerUserId, setMomentViewerUserId] = useState<string | null>(null);
  const [chatSearchVisible, setChatSearchVisible] = useState(false);
  const [mediaHubVisible, setMediaHubVisible] = useState(false);
  const [mediaTab, setMediaTab] = useState<"media" | "links" | "docs">("media");
  const [clearChatLoading, setClearChatLoading] = useState(false);

  const handleGoBack = useCallback(() => {
    router.replace("/(tabs)/chat");
  }, []);

  const handleViewProfile = useCallback(() => {
    if (peerHasLeftBetweener) return;
    const nextProfileId = resolvedPeerProfileId ?? peerProfileId;
    if (!nextProfileId) return;
    router.push({
      pathname: "/profile-view",
      params: { profileId: nextProfileId },
    });
  }, [peerHasLeftBetweener, peerProfileId, resolvedPeerProfileId]);

  const dismissHeaderHint = useCallback(() => {
    headerHintDismissedRef.current = true;
    void AsyncStorage.setItem(headerHintStorageKey, "1");
    if (!showHeaderHint) return;
    Animated.timing(headerHintOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowHeaderHint(false);
    });
  }, [headerHintOpacity, headerHintDismissedRef, headerHintStorageKey, setShowHeaderHint, showHeaderHint]);

  const handleHeaderPress = useCallback(() => {
    if (!conversationId || isChatBlocked || peerHasLeftBetweener) return;
    dismissHeaderHint();
    if (peerHasMoment) {
      setMomentViewerUserId(conversationId);
      setMomentViewerVisible(true);
      return;
    }
    handleViewProfile();
  }, [
    conversationId,
    dismissHeaderHint,
    handleViewProfile,
    isChatBlocked,
    peerHasLeftBetweener,
    peerHasMoment,
  ]);

  const handleCloseMomentViewer = useCallback(() => {
    setMomentViewerVisible(false);
    setMomentViewerUserId(null);
  }, []);

  const openReportModal = useCallback((message?: MessageType | null) => {
    setReportEvidenceMessage(message ?? null);
    setReportModalVisible(true);
  }, []);

  const closeReportModal = useCallback(() => {
    setReportModalVisible(false);
    setReportReasonId(null);
    setReportDetails("");
    setReportShouldBlock(false);
    setReportEvidenceMessage(null);
    setReportSubmitting(false);
  }, []);

  const performBlockUser = useCallback(
    async (options: { redirect?: boolean; showSuccessAlert?: boolean } = {}) => {
      if (!userId || !conversationId) return false;
      const { redirect = true, showSuccessAlert = true } = options;
      const { error } = await ChatThreadRemoteService.blockUser({
        blockerId: userId,
        blockedId: conversationId,
      });

      if (error) {
        if ((error as { code?: string }).code === "23505") {
          if (showSuccessAlert) {
            Alert.alert("Blocked", "This member is already blocked.");
          }
          if (redirect) {
            router.replace("/(tabs)/chat");
          }
          return true;
        }
        console.log("[chat] block user error", error);
        Alert.alert("Block user", "Unable to block this user right now.");
        return false;
      }

      setBlockStatus(blockedByMeValue);
      if (showSuccessAlert) {
        Alert.alert("Blocked", "This member has been blocked. They will not be notified.");
      }
      if (redirect) {
        router.replace("/(tabs)/chat");
      }
      return true;
    },
    [blockedByMeValue, conversationId, setBlockStatus, userId],
  );

  const submitReport = useCallback(async () => {
    if (!userId || !conversationId) return;
    if (!reportReasonId) {
      Alert.alert("Report user", "Select a reason to continue.");
      return;
    }
    setReportSubmitting(true);
    const reasonLabel = reportReasons.find((reason) => reason.id === reportReasonId)?.label ?? reportReasonId;
    const details = reportDetails.trim();
    const reason = details ? `${reasonLabel}: ${details}` : reasonLabel;

    const { error } = await ChatThreadRemoteService.submitReport({
      reportedId: conversationId,
      reason,
      evidenceMessageId: reportEvidenceMessage?.id ?? null,
      clientEvidence: {
        entry_point: reportEvidenceMessage ? "message_options" : "chat_options",
        message_type: reportEvidenceMessage?.type ?? null,
      },
    });

    if (error) {
      console.log("[chat] report user error", error);
      Alert.alert("Report user", "Unable to send this report right now.");
      setReportSubmitting(false);
      return;
    }

    const shouldBlockAfterReport = reportShouldBlock && !isBlockedByMe;
    setReportSubmitting(false);
    closeReportModal();

    let didBlock = false;
    if (shouldBlockAfterReport) {
      didBlock = Boolean(await performBlockUser({ redirect: true, showSuccessAlert: false }));
    }

    Alert.alert(
      "Report sent",
      didBlock
        ? "We will review this privately. This member is now blocked and will not be notified."
        : "We will review this privately. They will not be notified.",
    );
  }, [
    closeReportModal,
    conversationId,
    isBlockedByMe,
    performBlockUser,
    reportDetails,
    reportEvidenceMessage,
    reportReasonId,
    reportReasons,
    reportShouldBlock,
    userId,
  ]);

  const blockUser = useCallback(async () => {
    await performBlockUser();
  }, [performBlockUser]);

  const unblockUser = useCallback(async () => {
    if (!userId || !conversationId) return;
    const { error } = await ChatThreadRemoteService.unblockUser({
      blockerId: userId,
      blockedId: conversationId,
    });
    if (error) {
      console.log("[chat] unblock user error", error);
      Alert.alert("Unblock user", "Unable to unblock this user right now.");
      return;
    }
    setBlockStatus(null);
    Alert.alert("Unblocked", "You can message each other again.");
  }, [conversationId, setBlockStatus, userId]);

  const confirmUnblockUser = useCallback(() => {
    Alert.alert("Unblock user?", "You will be able to message each other again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unblock", style: "default", onPress: () => void unblockUser() },
    ]);
  }, [unblockUser]);

  const closeChatSearch = useCallback(() => {
    setChatSearchVisible(false);
  }, []);

  const closeMediaHub = useCallback(() => {
    setMediaHubVisible(false);
  }, []);

  const handleFilterMedia = useCallback(() => {
    setMediaTab("media");
    setMediaHubVisible(true);
  }, []);

  const handleSearchInChat = useCallback(() => {
    setChatSearchQuery("");
    setChatSearchVisible(true);
  }, [setChatSearchQuery]);

  const handleToggleMute = useCallback(() => {
    const next = !chatPrefsStateRef.current.muted;
    applyChatPrefsState({
      muted: next,
      pinned: chatPrefsStateRef.current.pinned,
    });
    triggerChatActionToast(next ? "Chat muted" : "Chat unmuted", next ? "volume-off" : "volume-high");
  }, [applyChatPrefsState, chatPrefsStateRef, triggerChatActionToast]);

  const applyMuteState = useCallback((next: boolean) => {
    applyChatPrefsState({
      muted: next,
      pinned: chatPrefsStateRef.current.pinned,
    });
    triggerChatActionToast(next ? "Chat muted" : "Chat unmuted", next ? "volume-off" : "volume-high");
  }, [applyChatPrefsState, chatPrefsStateRef, triggerChatActionToast]);

  const handleTogglePin = useCallback(() => {
    const next = !chatPrefsStateRef.current.pinned;
    applyChatPrefsState({
      muted: chatPrefsStateRef.current.muted,
      pinned: next,
    });
    triggerChatActionToast(next ? "Chat pinned" : "Chat unpinned", next ? "pin" : "pin-off-outline");
  }, [applyChatPrefsState, chatPrefsStateRef, triggerChatActionToast]);

  const applyPinState = useCallback((next: boolean) => {
    applyChatPrefsState({
      muted: chatPrefsStateRef.current.muted,
      pinned: next,
    });
    triggerChatActionToast(next ? "Chat pinned" : "Chat unpinned", next ? "pin" : "pin-off-outline");
  }, [applyChatPrefsState, chatPrefsStateRef, triggerChatActionToast]);

  const clearChatForMe = useCallback(async () => {
    if (!userId || !activePeerMessageUserId) return;
    setClearChatLoading(true);

    try {
      const messageIds = await fetchConversationMessageIds(userId, activePeerMessageUserId);
      const { data: hiddenRows, error: hiddenError } = await ChatThreadRemoteService.fetchHiddenMessages({
        currentUserId: userId,
        peerUserId: activePeerMessageUserId,
      });

      if (hiddenError) throw hiddenError;

      const hiddenSet = new Set(
        ((hiddenRows as { message_id: string }[] | null) ?? []).map((row) => row.message_id),
      );
      const idsToHide = messageIds.filter((id) => !hiddenSet.has(id));

      if (idsToHide.length > 0) {
        await insertMessageHidesBatched(userId, activePeerMessageUserId, idsToHide);
      }

      const nextSet = new Set(hiddenSet);
      idsToHide.forEach((id) => nextSet.add(id));
      updateHiddenMessageIds(Array.from(nextSet));
      await ChatRepository.clearThreadMessages(userId, activePeerMessageUserId);
      setMessages([]);
      setHasMore(false);
      setOldestTimestamp(null);
    } catch (error) {
      console.log("[chat] clear chat error", error);
      Alert.alert("Clear chat", "Unable to clear this chat right now.");
      await fetchHiddenMessages();
      await fetchMessages();
    } finally {
      setClearChatLoading(false);
    }
  }, [
    activePeerMessageUserId,
    fetchHiddenMessages,
    fetchMessages,
    setHasMore,
    setMessages,
    setOldestTimestamp,
    updateHiddenMessageIds,
    userId,
  ]);

  const handleClearChat = useCallback(() => {
    Alert.alert("Clear chat?", "This removes the chat history for you only.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => void clearChatForMe(),
      },
    ]);
  }, [clearChatForMe]);

  const handleBlockUser = useCallback(() => {
    if (!conversationId) return;
    Alert.alert(
      "Block user",
      "They will no longer be able to message you and you will no longer see them.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => void blockUser() },
      ],
    );
  }, [blockUser, conversationId]);

  const handleReportUser = useCallback(() => {
    if (!conversationId) return;
    openReportModal();
  }, [conversationId, openReportModal]);

  const handleReportMessage = useCallback((message: MessageType) => {
    if (!conversationId) return;
    openReportModal(message);
  }, [conversationId, openReportModal]);

  const handleOpenHeaderMenu = useCallback(() => {
    dismissHeaderHint();
    Haptics.selectionAsync().catch(() => {});
    void (async () => {
      let nextMuted = chatPrefsStateRef.current.muted;
      let nextPinned = chatPrefsStateRef.current.pinned;
      try {
        const raw = await AsyncStorage.getItem(chatPrefsStorageKey);
        const parsed = raw ? JSON.parse(raw) : {};
        const prefs =
          (conversationId && parsed?.[conversationId]) ||
          (routeId && parsed?.[routeId]) ||
          null;
        if (prefs && typeof prefs.muted === "boolean") {
          nextMuted = Boolean(prefs.muted);
        }
        if (prefs && typeof prefs.pinned === "boolean") {
          nextPinned = Boolean(prefs.pinned);
        }
      } catch {
        // Fall back to in-memory state when local prefs are unavailable.
      }

      router.push({
        pathname: "/chat-options",
        params: {
          id: routeId,
          peerUserId: conversationId,
          peerProfileId: resolvedPeerProfileId ?? peerProfileId ?? "",
          userName,
          peerHasLeftBetweener: String(peerHasLeftBetweener),
          canPlanDate: String(canPlanDate),
          datePlanUnlockReason,
          headerStatusLabel,
          conversationSignal: conversationSignal ?? "",
          isChatMuted: String(nextMuted),
          isChatPinned: String(nextPinned),
          isBlockedByMe: String(isBlockedByMe),
        },
      });
    })();
  }, [
    canPlanDate,
    chatPrefsStateRef,
    chatPrefsStorageKey,
    conversationId,
    conversationSignal,
    datePlanUnlockReason,
    dismissHeaderHint,
    headerStatusLabel,
    isBlockedByMe,
    peerHasLeftBetweener,
    peerProfileId,
    resolvedPeerProfileId,
    routeId,
    userName,
  ]);

  const handleHeaderLongPress = useCallback(() => {
    handleOpenHeaderMenu();
  }, [handleOpenHeaderMenu]);

  const runChatOptionsAction = useCallback((action: ChatOptionsActionPayload | null) => {
    if (!action) return;
    switch (action.type) {
      case "view-profile":
        handleViewProfile();
        break;
      case "search-chat":
        handleSearchInChat();
        break;
      case "media-hub":
        handleFilterMedia();
        break;
      case "suggest-date":
        if (action.force) {
          openDatePlannerUnlocked();
        } else {
          handleOpenDatePlanner();
        }
        break;
      case "toggle-mute":
        if (typeof action.value === "boolean") {
          applyMuteState(action.value);
        } else {
          handleToggleMute();
        }
        break;
      case "toggle-pin":
        if (typeof action.value === "boolean") {
          applyPinState(action.value);
        } else {
          handleTogglePin();
        }
        break;
      case "clear-chat":
        handleClearChat();
        break;
      case "toggle-block":
        if (isBlockedByMe) {
          confirmUnblockUser();
        } else {
          handleBlockUser();
        }
        break;
      case "report-user":
        handleReportUser();
        break;
      default:
        break;
    }
  }, [
    applyMuteState,
    applyPinState,
    confirmUnblockUser,
    handleBlockUser,
    handleClearChat,
    handleFilterMedia,
    handleOpenDatePlanner,
    handleReportUser,
    handleSearchInChat,
    handleToggleMute,
    handleTogglePin,
    handleViewProfile,
    isBlockedByMe,
    openDatePlannerUnlocked,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!routeId) return () => {};
      const queuedFeedback = consumeChatOptionsFeedback(routeId);
      if (queuedFeedback) {
        requestAnimationFrame(() => {
          triggerChatActionToast(queuedFeedback.label, queuedFeedback.icon);
        });
      }
      const queuedAction = consumeChatOptionsAction(routeId);
      if (queuedAction) {
        requestAnimationFrame(() => {
          runChatOptionsAction(queuedAction);
        });
      }
      return () => {};
    }, [routeId, runChatOptionsAction, triggerChatActionToast]),
  );

  return {
    reportModalVisible,
    reportReasonId,
    setReportReasonId,
    reportDetails,
    setReportDetails,
    reportShouldBlock,
    setReportShouldBlock,
    reportEvidenceMessage,
    reportSubmitting,
    momentViewerVisible,
    momentViewerUserId,
    chatSearchVisible,
    mediaHubVisible,
    mediaTab,
    setMediaTab,
    clearChatLoading,
    handleGoBack,
    handleViewProfile,
    dismissHeaderHint,
    handleHeaderPress,
    handleCloseMomentViewer,
    openReportModal,
    closeReportModal,
    submitReport,
    blockUser,
    unblockUser,
    confirmUnblockUser,
    closeChatSearch,
    closeMediaHub,
    handleFilterMedia,
    handleSearchInChat,
    handleToggleMute,
    applyMuteState,
    handleTogglePin,
    applyPinState,
    clearChatForMe,
    handleClearChat,
    handleBlockUser,
    handleReportUser,
    handleReportMessage,
    handleOpenHeaderMenu,
    handleHeaderLongPress,
  };
};
