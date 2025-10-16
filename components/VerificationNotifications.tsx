import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface VerificationNotification {
  id: string;
  verification_type: string;
  status: string;
  reviewer_notes: string;
  reviewed_at: string;
}

export const VerificationNotifications: React.FC = () => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<VerificationNotification[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;

    checkForNotifications();

    // Set up real-time subscription for new rejections
    const subscription = supabase
      .channel('verification_rejections')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'verification_requests',
          filter: `profile_id=eq.${profile.id}`,
        },
        (payload) => {
          console.log('Verification update detected:', payload);
          // Check if this is a rejection
          if (payload.new.status === 'rejected' && !payload.new.user_notified) {
            checkForNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile?.id]);

  const checkForNotifications = async () => {
    if (!profile?.id) return;
    
    try {
      // Get rejected verifications that haven't been acknowledged
      const { data, error } = await supabase
        .from('verification_requests')
        .select('id, verification_type, status, reviewer_notes, reviewed_at')
        .eq('profile_id', profile.id)
        .eq('status', 'rejected')
        .eq('user_notified', false)
        .order('reviewed_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setNotifications(data);
        setVisible(true);
      }
    } catch (error) {
      console.error('Error checking notifications:', error);
    }
  };

  const markAsNotified = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('verification_requests')
        .update({ user_notified: true })
        .eq('id', notificationId);

      if (error) throw error;

      // Remove from local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      if (notifications.length === 1) {
        setVisible(false);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleNotificationPress = (notification: VerificationNotification) => {
    Alert.alert(
      'Verification Rejected',
      `Your ${notification.verification_type || 'document'} verification was rejected.\n\nReason: ${notification.reviewer_notes || 'Please submit better documentation.'}\n\nYou can try again with improved documentation.`,
      [
        {
          text: 'OK',
          onPress: () => markAsNotified(notification.id),
        },
      ]
    );
  };

  if (!visible || notifications.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {notifications.map((notification) => (
        <TouchableOpacity
          key={notification.id}
          style={styles.notification}
          onPress={() => handleNotificationPress(notification)}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="close-circle" size={24} color="#f44336" />
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>Verification Rejected</Text>
            <Text style={styles.subtitle}>
              {`Your ${notification.verification_type || 'document'} verification needs attention`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={() => markAsNotified(notification.id)}
          >
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    padding: 16,
  },
  notification: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  iconContainer: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  dismissButton: {
    padding: 4,
  },
});