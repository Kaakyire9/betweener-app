import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type VerificationOutcome = 'approved' | 'rejected';

interface VerificationRequestNotification {
  kind: 'outcome';
  id: string;
  verification_type: string | null;
  status: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at?: string | null;
  user_notified?: boolean | null;
}

interface VerificationRefreshNotification {
  kind: 'fresh_review';
  id: string;
  profile_id: string;
  target_level: number;
  reason: string | null;
  requested_at: string | null;
}

type VerificationNotification = VerificationRequestNotification | VerificationRefreshNotification;

interface VerificationNotificationsProps {
  onOpenVerification?: () => void;
}

const getVerificationRequestTargetLevel = (verificationType?: string | null) => {
  switch ((verificationType || '').toLowerCase()) {
    case 'social':
      return 1;
    case 'passport':
    case 'residence':
    case 'workplace':
    case 'selfie_liveness':
      return 2;
    default:
      return 1;
  }
};

const getVerificationRequestTimestamp = (request?: Partial<VerificationRequestNotification> | null) => {
  const value = request?.reviewed_at || request?.created_at || null;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getVerificationMethodLabel = (verificationType?: string | null) => {
  switch ((verificationType || '').toLowerCase()) {
    case 'social':
      return 'social proof';
    case 'passport':
      return 'passport or visa proof';
    case 'residence':
      return 'residence proof';
    case 'workplace':
      return 'work or study proof';
    case 'selfie_liveness':
      return 'face check';
    default:
      return 'verification proof';
  }
};

const getOutcome = (notification: VerificationRequestNotification): VerificationOutcome =>
  notification.status === 'approved' ? 'approved' : 'rejected';

export const VerificationNotifications: React.FC<VerificationNotificationsProps> = ({
  onOpenVerification,
}) => {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<VerificationNotification[]>([]);
  const [visible, setVisible] = useState(false);

  const checkForNotifications = useCallback(async () => {
    if (!profile?.id) return;

    try {
      const [profileResult, requestResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, verification_level, verification_refresh_required, verification_refresh_reason, verification_refresh_target_level, verification_refresh_requested_at, verification_refresh_user_notified',
          )
          .eq('id', profile.id)
          .single(),
        supabase
          .from('verification_requests')
          .select('id, verification_type, status, reviewer_notes, reviewed_at, created_at, user_notified')
          .eq('profile_id', profile.id)
          .in('status', ['approved', 'rejected', 'pending'])
          .order('reviewed_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (requestResult.error) throw requestResult.error;

      const profileRow = profileResult.data as {
        id: string;
        verification_level?: number | null;
        verification_refresh_required?: boolean | null;
        verification_refresh_reason?: string | null;
        verification_refresh_target_level?: number | null;
        verification_refresh_requested_at?: string | null;
        verification_refresh_user_notified?: boolean | null;
      } | null;

      const freshReviewNotification: VerificationRefreshNotification | null =
        profileRow?.verification_refresh_required && !profileRow.verification_refresh_user_notified
          ? {
              kind: 'fresh_review',
              id: `fresh_review:${profileRow.id}:${profileRow.verification_refresh_requested_at || 'active'}`,
              profile_id: profileRow.id,
              target_level: Math.min(
                2,
                Math.max(
                  1,
                  profileRow.verification_refresh_target_level
                    || profileRow.verification_level
                    || profile?.verification_level
                    || 1,
                ),
              ),
              reason: profileRow.verification_refresh_reason || null,
              requested_at: profileRow.verification_refresh_requested_at || null,
            }
          : null;

      const requests = (requestResult.data || []) as VerificationRequestNotification[];
      const latestPending = requests.find((request) => request.status === 'pending');
      const currentLevel = profileRow?.verification_level || profile?.verification_level || 0;
      const freshReviewTargetLevel = freshReviewNotification?.target_level || 1;
      const actionableOutcomes = requests
        .filter((request) => {
          if (request.user_notified || !['approved', 'rejected'].includes(request.status || '')) {
            return false;
          }

          if (request.status === 'approved') {
            return true;
          }

          const coveredByCurrentLevel =
            currentLevel >= getVerificationRequestTargetLevel(request.verification_type);
          const rejectedFreshReview =
            request.status === 'rejected' &&
            Boolean(profileRow?.verification_refresh_required) &&
            getVerificationRequestTargetLevel(request.verification_type) >= freshReviewTargetLevel;
          const supersededByPending =
            Boolean(latestPending) &&
            getVerificationRequestTimestamp(latestPending) >= getVerificationRequestTimestamp(request);

          return (rejectedFreshReview || !coveredByCurrentLevel) && !supersededByPending;
        })
        .sort((a, b) => getVerificationRequestTimestamp(b) - getVerificationRequestTimestamp(a));

      const nextNotification = actionableOutcomes.length > 0
        ? actionableOutcomes.slice(0, 1)
        : freshReviewNotification
          ? [freshReviewNotification]
          : [];
      setNotifications(nextNotification);
      setVisible(nextNotification.length > 0);
    } catch (error) {
      console.error('Error checking notifications:', error);
    }
  }, [profile?.id, profile?.verification_level]);

  useEffect(() => {
    if (!profile?.id) return;

    void checkForNotifications();

    const requestSubscription = supabase
      .channel('verification_outcomes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'verification_requests',
          filter: `profile_id=eq.${profile.id}`,
        },
        (payload) => {
          const status = payload.new.status;
          if ((status === 'approved' || status === 'rejected') && !payload.new.user_notified) {
            void checkForNotifications();
          }
        },
      )
      .subscribe();

    const profileSubscription = supabase
      .channel('verification_refresh_requests')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.new.verification_refresh_required && !payload.new.verification_refresh_user_notified) {
            void checkForNotifications();
          }
        },
      )
      .subscribe();

    return () => {
      requestSubscription.unsubscribe();
      profileSubscription.unsubscribe();
    };
  }, [checkForNotifications, profile?.id]);

  const removeNotification = (notificationId: string) => {
    setNotifications((previous) => {
      const next = previous.filter((notification) => notification.id !== notificationId);
      setVisible(next.length > 0);
      return next;
    });
  };

  const markAsNotified = async (notification: VerificationNotification) => {
    try {
      if (notification.kind === 'fresh_review') {
        const { error } = await supabase.rpc('rpc_ack_verification_refresh', {
          p_profile_id: notification.profile_id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('rpc_ack_verification_request', {
          p_request_id: notification.id,
        });
        if (error) throw error;
      }

      removeNotification(notification.id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handlePrimaryAction = (notification: VerificationNotification) => {
    onOpenVerification?.();
    void markAsNotified(notification);
  };

  if (!visible || notifications.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { top: insets.top + 14 }]} pointerEvents="box-none">
      {notifications.map((notification) => {
        if (notification.kind === 'fresh_review') {
          return (
            <View key={notification.id} style={[styles.notification, styles.freshReviewNotification]}>
              <View style={[styles.iconContainer, styles.freshReviewIcon]}>
                <Ionicons name="shield-half-outline" size={22} color="#C2A8FF" />
              </View>

              <View style={styles.content}>
                <Text style={styles.eyebrow}>Private trust refresh</Text>
                <Text style={styles.title}>Betweener needs a quick fresh check</Text>
                <Text style={styles.subtitle}>
                  {notification.reason
                    ? `${notification.reason} Your current badge stays in place while we review it.`
                    : `Complete a private Trust level ${notification.target_level} refresh. Your current badge stays in place while we review it.`}
                </Text>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.primaryAction, styles.freshReviewAction]}
                    onPress={() => handlePrimaryAction(notification)}
                  >
                    <Text style={styles.primaryActionText}>Complete refresh</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={() => markAsNotified(notification)}
                  >
                    <Text style={styles.secondaryActionText}>Later</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.dismissButton}
                onPress={() => markAsNotified(notification)}
                accessibilityLabel="Dismiss fresh review update"
              >
                <Ionicons name="close" size={18} color="#9CB3AE" />
              </TouchableOpacity>
            </View>
          );
        }

        const outcome = getOutcome(notification);
        const targetLevel = getVerificationRequestTargetLevel(notification.verification_type);
        const methodLabel = getVerificationMethodLabel(notification.verification_type);
        const isApproved = outcome === 'approved';

        return (
          <View
            key={notification.id}
            style={[
              styles.notification,
              isApproved ? styles.approvedNotification : styles.rejectedNotification,
            ]}
          >
            <View style={[styles.iconContainer, isApproved ? styles.approvedIcon : styles.rejectedIcon]}>
              <Ionicons
                name={isApproved ? 'shield-checkmark-outline' : 'refresh-outline'}
                size={22}
                color={isApproved ? '#00D3C7' : '#F6A1A1'}
              />
            </View>

            <View style={styles.content}>
              <Text style={styles.eyebrow}>{isApproved ? 'Trust confirmed' : 'Private review update'}</Text>
              <Text style={styles.title}>
                {isApproved ? 'Your trust check is complete' : 'One proof needs another pass'}
              </Text>
              <Text style={styles.subtitle}>
                {isApproved
                  ? `Your profile now carries Trust level ${targetLevel}. Serious matches will see a stronger signal from you.`
                  : `We could not confirm enough from your ${methodLabel}. Add a clearer proof or choose another trust method.`}
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.primaryAction, isApproved ? styles.approvedAction : styles.rejectedAction]}
                  onPress={() => handlePrimaryAction(notification)}
                >
                  <Text style={styles.primaryActionText}>
                    {isApproved ? 'View trust status' : 'Improve proof'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={() => markAsNotified(notification)}
                >
                  <Text style={styles.secondaryActionText}>Later</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.dismissButton}
              onPress={() => markAsNotified(notification)}
              accessibilityLabel="Dismiss verification update"
            >
              <Ionicons name="close" size={18} color="#9CB3AE" />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 16,
  },
  notification: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#132322',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 8,
  },
  approvedNotification: {
    borderColor: 'rgba(0, 211, 199, 0.36)',
  },
  rejectedNotification: {
    borderColor: 'rgba(246, 161, 161, 0.42)',
  },
  freshReviewNotification: {
    borderColor: 'rgba(194, 168, 255, 0.44)',
    backgroundColor: '#16212A',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvedIcon: {
    backgroundColor: 'rgba(0, 211, 199, 0.14)',
  },
  rejectedIcon: {
    backgroundColor: 'rgba(246, 161, 161, 0.14)',
  },
  freshReviewIcon: {
    backgroundColor: 'rgba(194, 168, 255, 0.16)',
  },
  content: {
    flex: 1,
  },
  eyebrow: {
    color: '#9B7CC8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#E8F0ED',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B8CAC6',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  primaryAction: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  approvedAction: {
    backgroundColor: '#008F89',
  },
  rejectedAction: {
    backgroundColor: '#7A3E4B',
  },
  freshReviewAction: {
    backgroundColor: '#7460A8',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryAction: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryActionText: {
    color: '#9CB3AE',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissButton: {
    padding: 4,
  },
});
