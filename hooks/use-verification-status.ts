/**
 * Custom hook for managing verification status
 * 
 * Provides real-time verification status updates, pending requests,
 * rejection tracking, and resubmission eligibility for user verification.
 */

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

interface VerificationRequest {
  id: string;
  type: string;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

interface VerificationStatus {
  // Current status
  isVerified: boolean;
  verificationLevel: number;
  
  // Pending requests
  hasPendingRequest: boolean;
  pendingRequest?: {
    id: string;
    type: string;
    submittedAt: string;
  };
  
  // Rejection status
  hasRejection: boolean;
  rejectionReason?: string;
  lastRejectedAt?: string;
  
  // Resubmission eligibility
  canResubmit: boolean;
  
  // Loading state
  loading: boolean;
}

/**
 * Hook to get and manage user verification status
 * 
 * @param userId - User ID to check verification status for
 * @returns Verification status object and refresh function
 */
export const useVerificationStatus = (userId?: string) => {
  const [status, setStatus] = useState<VerificationStatus>({
    isVerified: false,
    verificationLevel: 0,
    hasPendingRequest: false,
    hasRejection: false,
    canResubmit: true,
    loading: true,
  });

  const fetchVerificationStatus = async () => {
    if (!userId) {
      setStatus(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      setStatus(prev => ({ ...prev, loading: true }));

      // Get user's verification level from profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('verification_level')
        .eq('user_id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }

      // Get verification requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (requestsError) {
        console.error('Error fetching verification requests:', requestsError);
        setStatus(prev => ({ ...prev, loading: false }));
        return;
      }

      const requests = requestsData || [];
      const verificationLevel = profileData?.verification_level || 0;
      
      // Find pending request
      const pendingRequest = requests.find(req => req.status === 'pending');
      
      // Find most recent rejection
      const rejectedRequests = requests.filter(req => req.status === 'rejected');
      const lastRejection = rejectedRequests[0]; // Most recent due to ordering
      
      // Determine if user can resubmit
      // Can resubmit if: no pending request OR last request was rejected
      const canResubmit = !pendingRequest;

      setStatus({
        isVerified: verificationLevel > 0,
        verificationLevel,
        hasPendingRequest: !!pendingRequest,
        pendingRequest: pendingRequest ? {
          id: pendingRequest.id,
          type: pendingRequest.verification_type,
          submittedAt: pendingRequest.created_at,
        } : undefined,
        hasRejection: !!lastRejection,
        rejectionReason: lastRejection?.reviewer_notes || undefined,
        lastRejectedAt: lastRejection?.reviewed_at || undefined,
        canResubmit,
        loading: false,
      });

    } catch (error) {
      console.error('Error fetching verification status:', error);
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchVerificationStatus();
  }, [userId]);

  // Set up real-time subscription for verification requests
  useEffect(() => {
    if (!userId) return;

    const subscription = supabase
      .channel('verification-status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'verification_requests',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refresh status when verification requests change
          fetchVerificationStatus();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refresh status when profile verification level changes
          fetchVerificationStatus();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  return {
    status,
    refreshStatus: fetchVerificationStatus,
  };
};

/**
 * Hook to get verification request history
 * 
 * @param userId - User ID to get history for
 * @returns Array of verification requests and loading state
 */
export const useVerificationHistory = (userId?: string) => {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('verification_requests')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedRequests: VerificationRequest[] = (data || []).map(req => ({
          id: req.id,
          type: req.verification_type,
          status: req.status,
          submittedAt: req.created_at,
          reviewedAt: req.reviewed_at,
          rejectionReason: req.reviewer_notes,
        }));

        setRequests(formattedRequests);
      } catch (error) {
        console.error('Error fetching verification history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [userId]);

  return { requests, loading };
};