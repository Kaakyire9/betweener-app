import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/telemetry/logger';
import { supabase } from '@/lib/supabase';
import { fetchCirclePulseItemSnapshot, fetchCirclePulseItems } from './circle-pulse-service';
import type { CirclePulseItem } from './circle-pulse-types';
import { useCirclePulseRefresh } from './use-circle-pulse-refresh';
import { readCirclePulseSnapshotState, writeCirclePulseSnapshot } from '@/lib/offline/circle-pulse-store';

export function useCirclePulse({ circleId, enabled }: { circleId: string; enabled: boolean }) {
  const [items, setItems] = useState<CirclePulseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortItems = useCallback((entries: CirclePulseItem[]) => (
    [...entries].sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      const leftStartsAt = left.startsAt ? new Date(left.startsAt).getTime() : Number.NEGATIVE_INFINITY;
      const rightStartsAt = right.startsAt ? new Date(right.startsAt).getTime() : Number.NEGATIVE_INFINITY;
      if (leftStartsAt !== rightStartsAt) return rightStartsAt - leftStartsAt;
      const leftExpiresAt = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const rightExpiresAt = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      if (leftExpiresAt !== rightExpiresAt) return leftExpiresAt - rightExpiresAt;
      return left.id.localeCompare(right.id);
    })
  ), []);

  const upsertItem = useCallback((nextItem: CirclePulseItem) => {
    setItems((current) => {
      const merged = current.some((item) => item.id === nextItem.id)
        ? current.map((item) => (item.id === nextItem.id ? nextItem : item))
        : [...current, nextItem];
      return sortItems(merged);
    });
  }, [sortItems]);

  const buildFallbackItem = useCallback((payload: any): CirclePulseItem => ({
    id: String(payload?.id ?? ''),
    circleId: String(payload?.circle_id ?? circleId),
    type: typeof payload?.item_type === 'string' ? payload.item_type as CirclePulseItem['type'] : 'host_note',
    title: typeof payload?.title === 'string' ? payload.title : null,
    subtitle: typeof payload?.subtitle === 'string' ? payload.subtitle : null,
    body: typeof payload?.body === 'string' ? payload.body : null,
    imageUrl: typeof payload?.image_url === 'string' ? payload.image_url : null,
    mediaUrl: typeof payload?.media_url === 'string' ? payload.media_url : null,
    mediaType:
      payload?.media_type === 'image' || payload?.media_type === 'video' || payload?.media_type === 'audio'
        ? payload.media_type
        : null,
    promptId: typeof payload?.prompt_id === 'string' ? payload.prompt_id : null,
    gatheringId: typeof payload?.gathering_id === 'string' ? payload.gathering_id : null,
    momentId: typeof payload?.moment_id === 'string' ? payload.moment_id : null,
    loveSeatId: typeof payload?.love_seat_id === 'string' ? payload.love_seat_id : null,
    featuredProfileId: typeof payload?.featured_profile_id === 'string' ? payload.featured_profile_id : null,
    featuredProfileName: null,
    featuredProfileAge: null,
    featuredProfileAvatarUrl: null,
    featuredProfileLocation: null,
    featuredProfileBadge: null,
    loveSeatQuote: null,
    welcomeProfiles: [],
    status: typeof payload?.status === 'string' ? payload.status as CirclePulseItem['status'] : 'active',
    priority: Number(payload?.priority ?? 0),
    startsAt: typeof payload?.starts_at === 'string' ? payload.starts_at : null,
    expiresAt: typeof payload?.expires_at === 'string' ? payload.expires_at : null,
    commentCount: Number(payload?.comment_count ?? 0),
    discussionCta: typeof payload?.discussion_cta === 'string' ? payload.discussion_cta : null,
    discussionSummary:
      typeof payload?.discussion_summary === 'string'
        ? payload.discussion_summary
        : payload?.discussion_summary === null
          ? null
          : null,
    gatheringStartsAt: null,
    gatheringCity: null,
    gatheringType: null,
    gatheringPresentationMode:
      payload?.gathering_presentation_mode === 'general' || payload?.gathering_presentation_mode === 'seat_linked'
        ? payload.gathering_presentation_mode
        : null,
    gatheringSeatContext:
      payload?.gathering_seat_context === 'welcome' || payload?.gathering_seat_context === 'love'
        ? payload.gathering_seat_context
        : null,
    gatheringHostCreatedForMember: payload?.gathering_host_created_for_member === true,
    gatheringIsPartnerVenue: payload?.gathering_is_partner_venue === true,
    gatheringSafeFirstDateSpace: payload?.gathering_safe_first_date_space === true,
    gatheringAttendeeCount: Number(payload?.gathering_attendee_count ?? 0),
    sourceAvailable: true,
  }), [circleId]);

  useEffect(() => {
    let cancelled = false;
    if (!circleId || !enabled) return () => {
      cancelled = true;
    };

    void (async () => {
      const snapshotState = await readCirclePulseSnapshotState(circleId);
      if (cancelled || !snapshotState.data) return;
      setItems((current) => (current.length ? current : snapshotState.data ?? []));
    })();

    return () => {
      cancelled = true;
    };
  }, [circleId, enabled]);

  const reload = useCallback(async () => {
    if (!circleId || !enabled) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextItems = await fetchCirclePulseItems(circleId);
      setItems(nextItems);
      void writeCirclePulseSnapshot(circleId, nextItems);
    } catch (loadError) {
      logger.warn('[circles] pulse_load_failed', {
        circleId,
        message: loadError instanceof Error ? loadError.message : String(loadError),
      });
      const snapshotState = await readCirclePulseSnapshotState(circleId);
      if (snapshotState.data) {
        setItems(snapshotState.data);
        setError('Showing saved Circle Pulse.');
      } else {
        setError('Circle Pulse could not refresh.');
      }
    } finally {
      setLoading(false);
    }
  }, [circleId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled || !circleId) return;
    void writeCirclePulseSnapshot(circleId, items);
  }, [circleId, enabled, items]);

  useCirclePulseRefresh({
    enabled: enabled && !!circleId,
    reload,
  });

  useEffect(() => {
    if (!enabled || !circleId) return;
    if (typeof supabase.channel !== 'function') return;

    const channel = supabase
      .channel(`circle-pulse-items:${circleId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'circle_pulse_items',
          filter: `circle_id=eq.${circleId}`,
        },
        (payload) => {
          const itemId = String(payload.new?.id ?? '');
          if (!itemId) return;
          setItems((current) => {
            if (!current.some((item) => item.id === itemId)) return current;
            return sortItems(current.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    commentCount: Number(payload.new?.comment_count ?? item.commentCount),
                    discussionCta: typeof payload.new?.discussion_cta === 'string' ? payload.new.discussion_cta : item.discussionCta,
                    discussionSummary: typeof payload.new?.discussion_summary === 'string'
                      ? payload.new.discussion_summary
                      : payload.new?.discussion_summary === null
                        ? null
                        : item.discussionSummary,
                    status: typeof payload.new?.status === 'string' ? payload.new.status as CirclePulseItem['status'] : item.status,
                    priority: Number(payload.new?.priority ?? item.priority),
                    startsAt: typeof payload.new?.starts_at === 'string' ? payload.new.starts_at : item.startsAt,
                    expiresAt: typeof payload.new?.expires_at === 'string' ? payload.new.expires_at : item.expiresAt,
                  }
                : item,
            ));
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'circle_pulse_items',
          filter: `circle_id=eq.${circleId}`,
        },
        (payload) => {
          const itemId = String(payload.new?.id ?? '');
          if (!itemId) return;
          void (async () => {
            try {
              const snapshot = await fetchCirclePulseItemSnapshot(itemId);
              if (snapshot) {
                upsertItem(snapshot);
              }
              return;
            } catch (error) {
              logger.warn('[circles] pulse_item_insert_snapshot_failed', {
                circleId,
                itemId,
                message: error instanceof Error ? error.message : String(error),
              });
            }
            upsertItem(buildFallbackItem(payload.new));
          })();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'circle_pulse_items',
          filter: `circle_id=eq.${circleId}`,
        },
        (payload) => {
          const itemId = String(payload.old?.id ?? '');
          if (!itemId) return;
          setItems((current) => current.filter((item) => item.id !== itemId));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buildFallbackItem, circleId, enabled, sortItems, upsertItem]);
  return { items, loading, error, reload };
}
