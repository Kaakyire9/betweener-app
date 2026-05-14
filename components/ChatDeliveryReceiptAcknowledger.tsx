import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { acknowledgeIncomingMessagesDelivered } from '@/lib/chat/delivery-receipts';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function ChatDeliveryReceiptAcknowledger() {
  const { user, isAuthenticated } = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const userId = isAuthenticated ? user?.id ?? null : null;
    if (!userId) return;

    const catchUpDelivered = () => {
      if (appStateRef.current !== 'active') return;
      void acknowledgeIncomingMessagesDelivered(userId);
    };

    catchUpDelivered();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        catchUpDelivered();
      }
    });

    const channel = supabase
      .channel(`delivery:root:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          if (appStateRef.current !== 'active') return;
          const messageId = typeof payload.new?.id === 'string' ? payload.new.id : null;
          if (!messageId) return;
          void acknowledgeIncomingMessagesDelivered(userId, messageId);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          catchUpDelivered();
        }
      });

    return () => {
      appStateSubscription.remove();
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user?.id]);

  return null;
}
