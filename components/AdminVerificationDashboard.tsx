import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface VerificationRequest {
  id: string;
  user_id: string;
  profile_id: string;
  verification_type: string;
  document_url: string;
  status: string;
  auto_verification_score: number | null;
  submitted_at: string;
  reviewer_notes: string | null;
  profiles: {
    full_name: string;
    current_country: string;
  } | null;
}

export const AdminVerificationDashboard: React.FC = () => {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    loadPendingRequests();
  }, []);

  const loadPendingRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('verification_requests')
        .select(`
          *,
          profiles!inner(full_name, current_country)
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      setRequests(data || []);
      
      // Load document URLs for all requests
      if (data && data.length > 0) {
        await loadDocumentUrls(data);
      }
    } catch (error) {
      console.error('Error loading requests:', error);
      Alert.alert('Error', 'Failed to load verification requests');
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentUrls = async (requestsData: VerificationRequest[]) => {
    const urls: Record<string, string> = {};
    
    console.log('Loading document URLs for', requestsData.length, 'requests');
    
    for (const request of requestsData) {
      if (request.document_url) {
        try {
          console.log('Loading URL for request:', request.id, 'document:', request.document_url);
          
          // Generate signed URL for private storage
          const { data, error } = await supabase.storage
            .from('verification-docs')
            .createSignedUrl(request.document_url, 3600); // 1 hour expiry
          
          if (data?.signedUrl && !error) {
            urls[request.id] = data.signedUrl;
            console.log('✅ Signed URL created for request:', request.id);
          } else {
            console.error('❌ Error creating signed URL for request:', request.id, error);
            // Fallback: try to get public URL
            const { data: publicData } = supabase.storage
              .from('verification-docs')
              .getPublicUrl(request.document_url);
            urls[request.id] = publicData.publicUrl;
            console.log('🔄 Using public URL fallback for request:', request.id);
          }
        } catch (error) {
          console.error('💥 Exception loading document URL for request:', request.id, error);
        }
      } else {
        console.log('⚠️ No document URL for request:', request.id);
      }
    }
    
    console.log('📊 Final document URLs:', Object.keys(urls).length, 'loaded');
    setDocumentUrls(urls);
  };

  const handleVerificationDecision = async (
    requestId: string, 
    decision: 'approved' | 'rejected',
    notes: string = ''
  ) => {
    try {
      console.log(`🔄 Processing ${decision} for request:`, requestId);
      
      // Update request status
      const { error: requestError } = await supabase
        .from('verification_requests')
        .update({
          status: decision,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notes,
          user_notified: false, // Reset notification flag so user gets notified
        })
        .eq('id', requestId);

      if (requestError) throw requestError;
      console.log(`✅ Request ${requestId} updated to ${decision}`);

      // If approved, update user verification level
      if (decision === 'approved') {
        const request = requests.find(r => r.id === requestId);
        if (request) {
          const levelMap = {
            social: 1,
            passport: 2,
            residence: 2,
            workplace: 2,
          };
          
          const newLevel = levelMap[request.verification_type as keyof typeof levelMap] || 1;
          console.log(`🔄 Updating profile ${request.profile_id} to level ${newLevel}`);
          
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ verification_level: newLevel })
            .eq('id', request.profile_id);

          if (profileError) throw profileError;
          console.log(`✅ Profile ${request.profile_id} updated to level ${newLevel}`);
        }
      }

      // Force refresh list by clearing current data first
      setRequests([]);
      setDocumentUrls({});
      console.log('🔄 Refreshing pending requests list...');
      
      // Refresh list
      await loadPendingRequests();
      console.log('✅ Pending requests list refreshed');
      
      Alert.alert(
        'Success', 
        `Verification ${decision === 'approved' ? 'approved' : 'rejected'} successfully`
      );

    } catch (error) {
      console.error('Error updating verification:', error);
      Alert.alert('Error', 'Failed to update verification status');
    }
  };

  const renderVerificationItem = ({ item }: { item: VerificationRequest }) => {
    const documentUrl = documentUrls[item.id];
    
    return (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.profiles?.full_name || 'Unknown User'}</Text>
            <Text style={styles.userEmail}>User ID: {item.user_id.slice(0, 8)}...</Text>
            <Text style={styles.country}>{item.profiles?.current_country || 'Unknown'}</Text>
          </View>
          <View style={styles.verificationInfo}>
            <Text style={styles.verificationType}>
              {item.verification_type.toUpperCase()}
            </Text>
            {item.auto_verification_score && (
              <Text style={[
                styles.autoScore,
                { color: item.auto_verification_score >= 0.7 ? '#4CAF50' : '#FF9800' }
              ]}>
                Auto: {(item.auto_verification_score * 100).toFixed(0)}%
              </Text>
            )}
          </View>
        </View>

        <View style={styles.documentSection}>
          <TouchableOpacity
            style={styles.documentPreview}
            onPress={() => {
              setSelectedRequest(item);
              setImageModalVisible(true);
            }}
          >
            {documentUrl ? (
              <Image
                source={{ uri: documentUrl }}
                style={styles.documentImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.documentImage, styles.documentPlaceholder]}>
                <Text style={styles.placeholderText}>Loading image...</Text>
              </View>
            )}
            <Text style={styles.viewDocumentText}>Tap to view full document</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleVerificationDecision(item.id, 'approved', 'Manually approved by admin')}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Approve</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => {
              // Use Alert.alert with buttons for cross-platform compatibility
              Alert.alert(
                'Reject Verification',
                'Are you sure you want to reject this verification?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: () => handleVerificationDecision(item.id, 'rejected', 'Rejected by admin review'),
                  },
                ]
              );
            }}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Reject</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.submittedDate}>
          Submitted: {new Date(item.submitted_at).toLocaleDateString()}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading verification requests...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verification Requests ({requests.length})</Text>
      
      <FlatList
        data={requests}
        renderItem={renderVerificationItem}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={() => {
          setLoading(true);
          loadPendingRequests();
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No pending verification requests</Text>
          </View>
        }
      />

      {/* Document Image Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={false}
        animationType="slide"
      >
        <View style={styles.imageModalContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setImageModalVisible(false)}
          >
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          
          {selectedRequest && (
            <>
              <Text style={styles.modalTitle}>
                {selectedRequest.profiles?.full_name || 'Unknown User'} - {selectedRequest.verification_type}
              </Text>
              {documentUrls[selectedRequest.id] ? (
                <Image
                  source={{ uri: documentUrls[selectedRequest.id] }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.imageLoadingContainer}>
                  <Text style={styles.imageLoadingText}>Loading image...</Text>
                </View>
              )}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  country: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 2,
  },
  verificationInfo: {
    alignItems: 'flex-end',
  },
  verificationType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  autoScore: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  documentSection: {
    marginBottom: 16,
  },
  documentPreview: {
    alignItems: 'center',
  },
  documentImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  documentPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  placeholderText: {
    fontSize: 14,
    color: '#666',
  },
  viewDocumentText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  submittedDate: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  imageModalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  fullScreenImage: {
    width: '90%',
    height: '70%',
  },
  imageLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageLoadingText: {
    color: '#fff',
    fontSize: 16,
  },
});