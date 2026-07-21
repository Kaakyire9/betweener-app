import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard } from "react-native";
import { encodeBase64 } from "tweetnacl-util";

import type { MessageType } from "@/components/chat/types";
import {
  completeViewOnceAttachment,
  prepareViewOnceAttachment,
} from "@/lib/chat/attachment-lifecycle";
import { decryptMediaBytes, getOrCreateDeviceKeypair } from "@/lib/e2ee";
import { supabase } from "@/lib/supabase";

type MessageEditRow = {
  id: string;
  message_id: string;
  editor_user_id: string;
  previous_text: string;
  created_at: string;
};

type ReactionSummaryItem = {
  emoji: string;
  count: number;
};

type ReactionListItem = {
  userId: string;
  emoji: string;
};

type UseChatThreadMessageUiArgs = {
  currentUserId?: string | null;
  conversationId?: string | null;
  renderedMessages: MessageType[];
  pinnedMessageIds: string[];
  setShowReactions: React.Dispatch<React.SetStateAction<string | null>>;
  viewOnceStatusRef: React.MutableRefObject<Record<string, { viewedByMe: boolean; viewedByPeer: boolean }>>;
  setViewOnceStatus: React.Dispatch<
    React.SetStateAction<Record<string, { viewedByMe: boolean; viewedByPeer: boolean }>>
  >;
  _chatMediaBucket: string;
};

export const useChatThreadMessageUi = ({
  currentUserId,
  conversationId,
  renderedMessages,
  pinnedMessageIds,
  setShowReactions,
  viewOnceStatusRef,
  setViewOnceStatus,
  _chatMediaBucket,
}: UseChatThreadMessageUiArgs) => {
  const [messageActionsVisible, setMessageActionsVisible] = useState(false);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [viewOnceModalMessage, setViewOnceModalMessage] = useState<MessageType | null>(null);
  const [viewOnceMediaUri, setViewOnceMediaUri] = useState<string | null>(null);
  const [viewOnceDecrypting, setViewOnceDecrypting] = useState(false);
  const [editHistoryVisible, setEditHistoryVisible] = useState(false);
  const [editHistoryMessage, setEditHistoryMessage] = useState<MessageType | null>(null);
  const [editHistoryEntries, setEditHistoryEntries] = useState<MessageEditRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [reactionSheetVisible, setReactionSheetVisible] = useState(false);
  const [reactionSheetMessageId, setReactionSheetMessageId] = useState<string | null>(null);
  const [reactionSheetEmoji, setReactionSheetEmoji] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const actionMessage = useMemo(() => {
    if (!actionMessageId) return null;
    return renderedMessages.find((msg) => msg.id === actionMessageId) ?? null;
  }, [actionMessageId, renderedMessages]);

  const isActionPinned = useMemo(() => {
    if (!actionMessage) return false;
    return pinnedMessageIds.includes(actionMessage.id);
  }, [actionMessage, pinnedMessageIds]);

  const canEditAction = useMemo(() => {
    if (!actionMessage || !currentUserId) return false;
    return (
      actionMessage.senderId === currentUserId &&
      actionMessage.type === "text" &&
      !actionMessage.deletedForAll &&
      !actionMessage.id.startsWith("temp-")
    );
  }, [actionMessage, currentUserId]);

  const canRetryActionMessage = useMemo(() => {
    if (!actionMessage || !currentUserId) return false;
    return (
      actionMessage.senderId === currentUserId &&
      actionMessage.type !== "system" &&
      !actionMessage.isSystem &&
      !actionMessage.isViewOnce &&
      actionMessage.status === "failed" &&
      !actionMessage.deletedForAll
    );
  }, [actionMessage, currentUserId]);

  const canReportActionMessage = useMemo(() => {
    if (!actionMessage || !currentUserId) return false;
    return (
      actionMessage.senderId !== currentUserId &&
      actionMessage.type !== "system" &&
      !actionMessage.isSystem &&
      !actionMessage.deletedForAll &&
      !actionMessage.id.startsWith("temp-")
    );
  }, [actionMessage, currentUserId]);

  const reactionSheetMessage = useMemo(() => {
    if (!reactionSheetMessageId) return null;
    return renderedMessages.find((msg) => msg.id === reactionSheetMessageId) ?? null;
  }, [reactionSheetMessageId, renderedMessages]);

  const reactionSummary = useMemo<ReactionSummaryItem[]>(() => {
    if (!reactionSheetMessage) return [];
    const counts = new Map<string, number>();
    reactionSheetMessage.reactions.forEach((reaction) => {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }, [reactionSheetMessage]);

  const reactionSheetList = useMemo<ReactionListItem[]>(() => {
    if (!reactionSheetMessage) return [];
    const list = reactionSheetMessage.reactions;
    if (!reactionSheetEmoji) return list;
    return list.filter((reaction) => reaction.emoji === reactionSheetEmoji);
  }, [reactionSheetEmoji, reactionSheetMessage]);

  const ensureOwnKeypair = useCallback(async () => {
    if (!currentUserId) return null;
    const keypair = await getOrCreateDeviceKeypair();
    const { data, error } = await supabase
      .from("profiles")
      .select("public_key")
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (error) {
      console.log("[chat] fetch own public key error", error);
    }
    if (!data?.public_key || data.public_key !== keypair.publicKeyB64) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ public_key: keypair.publicKeyB64 })
        .eq("user_id", currentUserId);
      if (updateError) {
        console.log("[chat] update public key error", updateError);
      }
    }
    return keypair;
  }, [currentUserId]);

  const fetchPeerPublicKey = useCallback(async () => {
    if (!conversationId) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("public_key")
      .eq("user_id", conversationId)
      .maybeSingle();
    if (error) {
      console.log("[chat] fetch peer public key error", error);
      return null;
    }
    return data?.public_key ?? null;
  }, [conversationId]);

  const openReactionSheet = useCallback((message: MessageType) => {
    setReactionSheetMessageId(message.id);
    setReactionSheetEmoji(null);
    setReactionSheetVisible(true);
  }, []);

  const closeReactionSheet = useCallback(() => {
    setReactionSheetVisible(false);
    setReactionSheetMessageId(null);
    setReactionSheetEmoji(null);
  }, []);

  const openEditHistory = useCallback(async (message: MessageType) => {
    if (!message.editedAt) return;
    setEditHistoryMessage(message);
    setEditHistoryVisible(true);
    setEditHistoryEntries([]);
    setEditHistoryLoading(true);
    const { data, error } = await supabase
      .from("message_edits")
      .select("id,message_id,editor_user_id,previous_text,created_at")
      .eq("message_id", message.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.log("[chat] edit history error", error);
      setEditHistoryEntries([]);
      setEditHistoryLoading(false);
      return;
    }
    setEditHistoryEntries((data || []) as MessageEditRow[]);
    setEditHistoryLoading(false);
  }, []);

  const closeEditHistory = useCallback(() => {
    setEditHistoryVisible(false);
    setEditHistoryMessage(null);
    setEditHistoryEntries([]);
  }, []);

  const closeViewOnceMessage = useCallback(async () => {
    if (!viewOnceModalMessage) return;
    setViewOnceModalMessage(null);
    setViewOnceDecrypting(false);
    if (viewOnceMediaUri) {
      try {
        await FileSystem.deleteAsync(viewOnceMediaUri, { idempotent: true });
      } catch (error) {
        console.log("[chat] view-once cleanup error", error);
      }
    }
    setViewOnceMediaUri(null);
  }, [viewOnceMediaUri, viewOnceModalMessage]);

  const openViewOnceMessage = useCallback(async (message: MessageType) => {
    if (!currentUserId) return;
    if (!message.isViewOnce || !message.encryptedMedia) return;
    if (message.senderId === currentUserId) return;
    if (viewOnceStatusRef.current[message.id]?.viewedByMe) return;
    console.log("[chat][view-once-open] start", {
      messageId: message.id,
      currentUserId,
      conversationId: conversationId ?? null,
      senderId: message.senderId,
      type: message.type,
    });
    setViewOnceModalMessage(message);
    setViewOnceDecrypting(true);

    try {
      const keypair = await ensureOwnKeypair();
      if (!keypair) {
        throw new Error("missing_keypair");
      }
      console.log("[chat][view-once-open] own-keypair-ready", {
        messageId: message.id,
      });
      const prepared = await prepareViewOnceAttachment(message.id);
      console.log("[chat][view-once-open] prepare-success", {
        messageId: message.id,
        attachmentId: prepared.attachmentId,
        mimeType: prepared.mimeType,
        byteSize: prepared.byteSize,
        hasSenderPublicKey: Boolean(prepared.senderPublicKey),
      });
      const signedUrl = prepared.signedUrl;
      const encryptedKeyReceiver = prepared.encryptedKeyReceiver;
      const encryptedKeyNonce = prepared.encryptedKeyNonce;
      const encryptedMediaNonce = prepared.encryptedMediaNonce;
      const encryptedMediaMime = prepared.mimeType;
      const senderPublicKey = prepared.senderPublicKey || await fetchPeerPublicKey();
      if (!senderPublicKey) {
        throw new Error("missing_sender_key");
      }
      console.log("[chat][view-once-open] sender-key-ready", {
        messageId: message.id,
        usedClaimedSenderKey: Boolean(prepared.senderPublicKey),
      });
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error("view_once_download_failed");
      console.log("[chat][view-once-open] download-success", {
        messageId: message.id,
        status: res.status,
      });
      const buf = await res.arrayBuffer();
      const cipherBytes = new Uint8Array(buf);
      const plaintext = await decryptMediaBytes({
        cipherBytes,
        mediaNonceB64: encryptedMediaNonce,
        keyNonceB64: encryptedKeyNonce,
        encryptedKeyB64: encryptedKeyReceiver,
        senderPublicKeyB64: senderPublicKey,
        receiverSecretKeyB64: keypair.secretKeyB64,
      });
      cipherBytes.fill(0);
      if (!plaintext) {
        throw new Error("decrypt_failed");
      }
      console.log("[chat][view-once-open] decrypt-success", {
        messageId: message.id,
        plaintextByteSize: plaintext.length,
      });

      const isVideo = message.type === "video" || (encryptedMediaMime || "").includes("video");
      const ext = isVideo ? "mp4" : "jpg";
      const tempPath = `${FileSystem.cacheDirectory ?? ""}viewonce-${message.id}.${ext}`;
      const base64 = encodeBase64(plaintext);
      plaintext.fill(0);
      await FileSystem.writeAsStringAsync(tempPath, base64, {
        encoding: FileSystem.EncodingType?.Base64 ?? "base64",
      });

      console.log("[chat][view-once-open] file-write-success", {
        messageId: message.id,
        tempPath,
        isVideo,
      });
      const completed = await completeViewOnceAttachment(message.id);
      console.log("[chat][view-once-open] complete-success", {
        messageId: message.id,
        attachmentId: completed.attachmentId,
      });
      viewOnceStatusRef.current[message.id] = {
        viewedByMe: true,
        viewedByPeer: viewOnceStatusRef.current[message.id]?.viewedByPeer ?? false,
      };
      if (isMountedRef.current) {
        setViewOnceStatus((prev) => ({ ...prev, [message.id]: viewOnceStatusRef.current[message.id] }));
        setViewOnceMediaUri(tempPath);
      }
    } catch (error) {
      console.log("[chat][view-once-open] error", {
        messageId: message.id,
        code: (error as { code?: string })?.code ?? null,
        message: error instanceof Error ? error.message : String(error),
      }, error);
      const errorCode = String(
        (error as { code?: string })?.code || (error as { message?: string })?.message || "",
      ).toLowerCase();
      const alreadyConsumed = errorCode.includes("already_consumed");
      if (alreadyConsumed) {
        viewOnceStatusRef.current[message.id] = {
          viewedByMe: true,
          viewedByPeer: viewOnceStatusRef.current[message.id]?.viewedByPeer ?? false,
        };
        if (isMountedRef.current) {
          setViewOnceStatus((prev) => ({ ...prev, [message.id]: viewOnceStatusRef.current[message.id] }));
        }
      }
      Alert.alert(
        "View once",
        alreadyConsumed
          ? "This media has already been viewed."
          : errorCode.includes("not_found") || errorCode.includes("unavailable")
            ? "This media is no longer available."
            : errorCode.includes("access_denied")
              ? "Only the recipient can open this media."
              : "Unable to open media. Please try again.",
      );
      if (isMountedRef.current) {
        setViewOnceModalMessage(null);
        setViewOnceMediaUri(null);
      }
    } finally {
      if (isMountedRef.current) {
        setViewOnceDecrypting(false);
      }
    }
  }, [conversationId, currentUserId, ensureOwnKeypair, fetchPeerPublicKey, setViewOnceStatus, viewOnceStatusRef]);

  const closeMessageActions = useCallback(() => {
    setMessageActionsVisible(false);
    setActionMessageId(null);
  }, []);

  const handleLongPress = useCallback((messageId: string) => {
    const target = renderedMessages.find((msg) => msg.id === messageId);
    if (!target) return;
    Keyboard.dismiss();
    setShowReactions((prev) => (prev === messageId ? null : messageId));
    Haptics.selectionAsync().catch(() => {});
  }, [renderedMessages, setShowReactions]);

  return {
    messageActionsVisible,
    setMessageActionsVisible,
    actionMessageId,
    setActionMessageId,
    actionMessage,
    isActionPinned,
    canEditAction,
    canRetryActionMessage,
    canReportActionMessage,
    viewOnceModalMessage,
    viewOnceMediaUri,
    viewOnceDecrypting,
    editHistoryVisible,
    editHistoryMessage,
    editHistoryEntries,
    editHistoryLoading,
    reactionSheetVisible,
    reactionSheetEmoji,
    setReactionSheetEmoji,
    reactionSheetMessage,
    reactionSummary,
    reactionSheetList,
    openReactionSheet,
    closeReactionSheet,
    openEditHistory,
    closeEditHistory,
    openViewOnceMessage,
    closeViewOnceMessage,
    closeMessageActions,
    handleLongPress,
  };
};
