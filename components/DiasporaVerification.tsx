import { useVerificationStatus } from '@/hooks/use-verification-status';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// Basic automated validation functions
const validateImageQuality = async (asset: any): Promise<{ valid: boolean; message: string }> => {
  // Check file size (max 10MB)
  if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
    return { valid: false, message: 'Image too large. Please use an image under 10MB.' };
  }
  
  // Check dimensions (minimum 800x600)
  if (asset.width < 800 || asset.height < 600) {
    return { valid: false, message: 'Image resolution too low. Please use a clearer image.' };
  }
  
  return { valid: true, message: 'Image quality acceptable' };
};

const calculateAutomatedScore = async (method: string, asset: any): Promise<{
  confidence: number;
  autoApprove: boolean;
  reason: string;
}> => {
  let confidence = 0.5; // Base confidence
  let reason = '';
  
  // Method-specific scoring
  switch (method) {
    case 'social':
      // Social media verification gets auto-approval for basic level
      confidence = 0.8;
      reason = 'Social media verification auto-approved';
      return { confidence, autoApprove: true, reason };
      
    case 'passport':
    case 'residence':
    case 'workplace':
      // Document verification requires higher standards
      
      // Basic image quality checks increase confidence
      if (asset.width >= 1920 && asset.height >= 1080) {
        confidence += 0.2; // High resolution
      }
      
      if (asset.fileSize && asset.fileSize > 1024 * 1024) {
        confidence += 0.1; // Good file size indicates quality
      }
      
      // Auto-approve if confidence is high enough
      if (confidence >= 0.75) {
        reason = `High quality document image (${(confidence * 100).toFixed(0)}% confidence)`;
        return { confidence, autoApprove: true, reason };
      } else {
        reason = `Manual review required (${(confidence * 100).toFixed(0)}% confidence)`;
        return { confidence, autoApprove: false, reason };
      }
      
    default:
      reason = 'Unknown verification method';
      return { confidence: 0.3, autoApprove: false, reason };
  }
};

interface DiasporaVerificationProps {
  visible: boolean;
  onClose: () => void;
  profile: any;
  onVerificationUpdate: (level: number) => void;
}

export const DiasporaVerification: React.FC<DiasporaVerificationProps> = ({
  visible,
  onClose,
  profile,
  onVerificationUpdate,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const { status: verificationStatus, refreshStatus } = useVerificationStatus(profile?.id);

  const verificationMethods = [
    {
      id: 'passport',
      title: 'Passport/Visa',
      description: 'Upload a photo of your passport or visa stamps',
      level: 2,
      icon: 'document-text-outline',
      color: '#4CAF50',
    },
    {
      id: 'residence',
      title: 'Residence Proof',
      description: 'Utility bill, lease agreement, or bank statement',
      level: 2,
      icon: 'home-outline',
      color: '#2196F3',
    },
    {
      id: 'social',
      title: 'Social Media',
      description: 'Link your social media showing location history',
      level: 1,
      icon: 'logo-instagram',
      color: '#E91E63',
    },
    {
      id: 'workplace',
      title: 'Work/Study Proof',
      description: 'Employment letter or student ID from abroad',
      level: 2,
      icon: 'briefcase-outline',
      color: '#FF9800',
    },
  ];

  const handleImageUpload = async (method: string) => {
    try {
      setLoading(true);
      
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photos');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      
      // Basic image validation (automated check #1)
      const isValidImage = await validateImageQuality(asset);
      if (!isValidImage.valid) {
        Alert.alert('Image Quality Issue', isValidImage.message);
        return;
      }
      
      // Upload to Supabase storage
      const fileName = `verification_${method}_${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: 'image/jpeg',
        name: fileName,
      } as any);

      const { data, error } = await supabase.storage
        .from('verification-docs')
        .upload(`${profile.user_id}/${fileName}`, formData);

      if (error) throw error;

      // Create verification request with automated scoring
      const autoScore = await calculateAutomatedScore(method, asset);
      
      // Insert verification request
      const { error: requestError } = await supabase
        .from('verification_requests')
        .insert({
          user_id: profile.user_id,
          profile_id: profile.id,
          verification_type: method,
          document_url: data.path,
          auto_verification_score: autoScore.confidence,
          status: autoScore.autoApprove ? 'approved' : 'pending',
          reviewer_notes: autoScore.autoApprove 
            ? `Auto-approved: ${autoScore.reason}` 
            : `Pending review: ${autoScore.reason}`,
        });

      if (requestError) throw requestError;

      // Update verification level based on auto-scoring
      const methodData = verificationMethods.find(m => m.id === method);
      const newLevel = autoScore.autoApprove 
        ? Math.max(profile.verification_level || 0, methodData?.level || 1)
        : profile.verification_level || 0;
      
      if (autoScore.autoApprove) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            verification_level: newLevel,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);

        if (updateError) throw updateError;
        onVerificationUpdate(newLevel);
      }

      // Show appropriate message
      Alert.alert(
        autoScore.autoApprove ? 'Verification Approved!' : 'Verification Submitted!',
        autoScore.autoApprove 
          ? `Your ${methodData?.title} verification was automatically approved!`
          : `Your ${methodData?.title} verification is being reviewed. You'll be notified once approved.`
      );
      
      // Refresh verification status
      refreshStatus();
      onClose();

    } catch (error) {
      console.error('Verification upload error:', error);
      Alert.alert('Upload Failed', 'Please try again later');
    } finally {
      setLoading(false);
    }
  };

  const getVerificationBadge = (level: number) => {
    const badges = [
      { level: 0, label: 'Unverified', color: '#9E9E9E', icon: 'help-circle-outline' },
      { level: 1, label: 'Basic', color: '#4CAF50', icon: 'checkmark-circle-outline' },
      { level: 2, label: 'Verified', color: '#2196F3', icon: 'shield-checkmark-outline' },
      { level: 3, label: 'Premium', color: '#FF9800', icon: 'star-outline' },
    ];
    
    return badges.find(b => b.level === level) || badges[0];
  };

  const currentBadge = getVerificationBadge(profile?.verification_level || 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Diaspora Verification</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          {/* Rejection Status Alert */}
          {verificationStatus.hasRejection && (
            <View style={styles.rejectionAlert}>
              <View style={styles.rejectionHeader}>
                <Ionicons name="close-circle" size={24} color="#f44336" />
                <Text style={styles.rejectionTitle}>Verification Rejected</Text>
              </View>
              <Text style={styles.rejectionReason}>
                {verificationStatus.rejectionReason || 'Your verification was rejected. Please try again with better documentation.'}
              </Text>
              {verificationStatus.lastRejectedAt && (
                <Text style={styles.rejectionDate}>
                  Rejected on {new Date(verificationStatus.lastRejectedAt).toLocaleDateString()}
                </Text>
              )}
              {!verificationStatus.canResubmit && (
                <Text style={styles.pendingText}>
                  You have a pending verification request. Please wait for review.
                </Text>
              )}
            </View>
          )}

          {/* Pending Status Alert */}
          {verificationStatus.pendingRequest && !verificationStatus.hasRejection && (
            <View style={styles.pendingAlert}>
              <View style={styles.pendingHeader}>
                <Ionicons name="time" size={24} color="#FF9800" />
                <Text style={styles.pendingTitle}>Verification Pending</Text>
              </View>
              <Text style={styles.pendingText}>
                Your {verificationStatus.pendingRequest.type} verification is being reviewed.
              </Text>
              <Text style={styles.pendingDate}>
                Submitted on {new Date(verificationStatus.pendingRequest.submittedAt).toLocaleDateString()}
              </Text>
            </View>
          )}

          {/* Current Status */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Ionicons 
                name={currentBadge.icon as any} 
                size={32} 
                color={currentBadge.color} 
              />
              <View style={styles.statusText}>
                <Text style={styles.statusLevel}>{currentBadge.label} Verified</Text>
                <Text style={styles.statusDescription}>
                  {profile?.verification_level === 0 && "Start verification to build trust"}
                  {profile?.verification_level === 1 && "Basic verification completed"}
                  {profile?.verification_level === 2 && "Fully verified diaspora member"}
                  {profile?.verification_level === 3 && "Premium verified member"}
                </Text>
              </View>
            </View>
          </View>

          {/* Why Verify */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why verify your diaspora status?</Text>
            <View style={styles.benefitsList}>
              <View style={styles.benefit}>
                <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
                <Text style={styles.benefitText}>Build trust with potential matches</Text>
              </View>
              <View style={styles.benefit}>
                <Ionicons name="eye" size={20} color="#4CAF50" />
                <Text style={styles.benefitText}>Increase profile visibility</Text>
              </View>
              <View style={styles.benefit}>
                <Ionicons name="heart" size={20} color="#4CAF50" />
                <Text style={styles.benefitText}>Connect with verified diaspora members</Text>
              </View>
              <View style={styles.benefit}>
                <Ionicons name="globe" size={20} color="#4CAF50" />
                <Text style={styles.benefitText}>Access long-distance matching features</Text>
              </View>
            </View>
          </View>

          {/* Verification Methods */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose verification method</Text>
            {verificationMethods.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.methodCard,
                  selectedMethod === method.id && styles.selectedMethod
                ]}
                onPress={() => setSelectedMethod(method.id)}
                disabled={loading}
              >
                <View style={styles.methodHeader}>
                  <View style={[styles.methodIcon, { backgroundColor: `${method.color}20` }]}>
                    <Ionicons name={method.icon as any} size={24} color={method.color} />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={styles.methodTitle}>{method.title}</Text>
                    <Text style={styles.methodDescription}>{method.description}</Text>
                  </View>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>Level {method.level}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action Button */}
          {selectedMethod && (
            <TouchableOpacity
              style={[
                styles.submitButton, 
                (loading || !verificationStatus.canResubmit) && styles.submitButtonDisabled
              ]}
              onPress={() => handleImageUpload(selectedMethod)}
              disabled={loading || !verificationStatus.canResubmit}
            >
              <Text style={styles.submitButtonText}>
                {loading 
                  ? 'Uploading...' 
                  : !verificationStatus.canResubmit 
                    ? 'Verification Pending Review'
                    : 'Upload Verification Document'
                }
              </Text>
            </TouchableOpacity>
          )}

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color="#666" />
            <Text style={styles.disclaimerText}>
              Your documents are securely stored and only used for verification purposes. 
              Review typically takes 1-2 business days.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 16,
    flex: 1,
  },
  statusLevel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statusDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  benefitsList: {
    gap: 12,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  benefitText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
  },
  methodCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  selectedMethod: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: 16,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  methodDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  levelBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  levelText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
    lineHeight: 18,
  },
  // Rejection status styles
  rejectionAlert: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rejectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f44336',
    marginLeft: 8,
  },
  rejectionReason: {
    fontSize: 14,
    color: '#d32f2f',
    marginBottom: 8,
    lineHeight: 20,
  },
  rejectionDate: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  // Pending status styles
  pendingAlert: {
    backgroundColor: '#fff3e0',
    borderColor: '#FF9800',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9800',
    marginLeft: 8,
  },
  pendingText: {
    fontSize: 14,
    color: '#e65100',
    marginBottom: 4,
  },
  pendingDate: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});