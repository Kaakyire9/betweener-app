import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

interface VerificationStatus {
  level: number;
  hasRejection: boolean;
  rejectionReason?: string;
  canResubmit: boolean;
  pendingRequest?: {
    id: string;
    type: string;
    submittedAt: string;
  };
  lastRejectedAt?: string;
}

export const useVerificationStatus = (profileId?: string) => {
  const [status, setStatus] = useState<VerificationStatus>({
    level: 0,
    hasRejection: false,
    canResubmit: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      return;
    }

    loadVerificationStatus();

    // Set up real-time subscription for verification requests
    const subscription = supabase
      .channel('verification_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'verification_requests',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          console.log('Verification request change detected:', payload);
          loadVerificationStatus();
        }
      )
      .subscribe();

    // Also subscribe to profile changes for verification level updates
    const profileSubscription = supabase
      .channel('profile_verification_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profileId}`,
        },
        (payload) => {
          console.log('Profile verification level change detected:', payload);
          loadVerificationStatus();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      profileSubscription.unsubscribe();
    };
  }, [profileId]);

  const loadVerificationStatus = async () => {
    try {
      // Get profile verification level
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('verification_level')
        .eq('id', profileId)
        .single();

      if (profileError) throw profileError;

      // Get verification requests to check for rejections and pending requests
      const { data: requests, error: requestsError } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // Find the most recent request
      const latestRequest = requests?.[0];
      
      // Find pending request
      const pendingRequest = requests?.find(r => r.status === 'pending');
      
      // Find latest rejection that hasn't been superseded by a newer approval
      const latestRejection = requests?.find(r => r.status === 'rejected');
      
      // Check if there's an approved request after the latest rejection
      const hasApprovalAfterRejection = latestRejection && requests?.some(r => 
        r.status === 'approved' && 
        new Date(r.created_at) > new Date(latestRejection.created_at)
      );

      // Only show rejection if it's the latest status and not superseded by approval
      const shouldShowRejection = latestRejection && 
        !hasApprovalAfterRejection && 
        latestRequest?.status === 'rejected';

      // Check if user can resubmit (no pending request exists)
      const canResubmit = !pendingRequest;

      setStatus({
        level: profile?.verification_level || 0,
        hasRejection: shouldShowRejection,
        rejectionReason: shouldShowRejection ? latestRejection?.reviewer_notes : undefined,
        canResubmit,
        pendingRequest: pendingRequest ? {
          id: pendingRequest.id,
          type: pendingRequest.verification_type,
          submittedAt: pendingRequest.submitted_at,
        } : undefined,
        lastRejectedAt: shouldShowRejection ? latestRejection?.reviewed_at : undefined,
      });

    } catch (error) {
      console.error('Error loading verification status:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = () => {
    if (profileId) {
      setLoading(true);
      loadVerificationStatus();
    }
  };

  return {
    status,
    loading,
    refreshStatus,
  };
};