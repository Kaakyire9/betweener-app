import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { isActiveChatThread } from "@/lib/chat/active-thread";
import { emitForegroundChatMessage } from "@/lib/chat/chat-foreground-events";
import { acknowledgeIncomingMessagesDelivered } from "@/lib/chat/delivery-receipts";
import { ChatRepository, type ChatMessageRow } from "@/lib/chat/local/chat-db";
import { supabase } from "@/lib/supabase";

type RealtimeMessageRow = {
  id: string;
  client_message_id?: string | null;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at?: string | null;
  deleted_for_all?: boolean | null;
  deleted_at?: string | null;
  edited_at?: string | null;
  message_type?: string | null;
  is_view_once?: boolean | null;
};

const toLocalChatMessage = (ownerUserId: string, row: RealtimeMessageRow): ChatMessageRow => {
  const threadId = row.sender_id === ownerUserId ? row.receiver_id : row.sender_id;
  const isMine = row.sender_id === ownerUserId;
  const status: ChatMessageRow["status"] = row.deleted_for_all
    ? "deleted"
    : isMine
      ? row.is_read
        ? "read"
        : row.delivered_at
          ? "delivered"
          : "sent"
      : row.is_read
        ? "read"
        : "delivered";

  return {
    id: row.id,
    local_id: row.client_message_id ?? null,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: row.sender_id,
    receiver_user_id: row.receiver_id,
    body: row.text ?? "",
    message_type: row.message_type === "voice"
      ? "voice"
      : ((row.message_type ?? "text") as ChatMessageRow["message_type"]),
    status,
    direction: isMine ? "outgoing" : "incoming",
    created_at: row.created_at,
    server_created_at: row.created_at,
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at ?? (row.deleted_for_all ? row.created_at : null),
    reply_to_message_id: null,
    is_view_once: row.is_view_once ? 1 : 0,
    local_only: 0,
    error_code: null,
    metadata_json: null,
    remote_updated_at: row.created_at,
    local_updated_at: new Date().toISOString(),
  };
};

export default function ChatRealtimeHydrator() {
  const { user, isAuthenticated } = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const userId = isAuthenticated ? user?.id ?? null : null;
    if (!userId) return;

    const catchUpDelivered = () => {
      if (appStateRef.current !== "active") return;
      void acknowledgeIncomingMessagesDelivered(userId);
    };

    const persistMessage = (row: RealtimeMessageRow | null | undefined) => {
      if (appStateRef.current !== "active") return;
      if (!row?.id || !row.sender_id || !row.receiver_id) return;
      if (row.sender_id !== userId && row.receiver_id !== userId) return;

      const threadId = row.sender_id === userId ? row.receiver_id : row.sender_id;
      if (!threadId) return;
      if (isActiveChatThread(userId, threadId)) return;

      void ChatRepository.upsertMessages(userId, threadId, [
        toLocalChatMessage(userId, row),
      ]).catch((error) => {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[chat] root realtime persist error", error);
        }
      });
      void ChatRepository.markSyncSucceeded(userId, "global_threads", {
        cursor: row.created_at,
      });
    };

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (nextState === "active") {
        catchUpDelivered();
      }
    });

    catchUpDelivered();

    const channel = supabase
      .channel(`messages:root:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeMessageRow;
          persistMessage(row);
          void acknowledgeIncomingMessagesDelivered(userId, row.id, row.sender_id);
          if (
            row?.sender_id &&
            row.sender_id !== userId &&
            !isActiveChatThread(userId, row.sender_id)
          ) {
            emitForegroundChatMessage({
              id: row.id,
              sender_id: row.sender_id,
              receiver_id: row.receiver_id,
              text: row.text ?? null,
              message_type: row.message_type ?? null,
              is_view_once: row.is_view_once ?? null,
            });
          }
        },
      )
      .subscribe();

    return () => {
      appStateSubscription.remove();
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user?.id]);

  return null;
}
