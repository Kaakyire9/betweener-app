import { useVerificationStatus } from '@/hooks/use-verification-status';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Circle } from 'react-native-svg';
import { Worklets } from 'react-native-worklets-core';
import { useFaceDetector, type Face, type FrameFaceDetectionOptions } from 'react-native-vision-camera-face-detector';
import { Camera as VisionCamera, runAsync, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import {
    Alert,
    Dimensions,
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
  reason: string;
}> => {
  let confidence = 0.5; // Base confidence
  let reason = '';
  
  // Method-specific scoring
  switch (method) {
    case 'social':
      confidence = 0.8;
      reason = 'Social media verification ready for review';
      return { confidence, reason };
      
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

      reason = `Manual review required (${(confidence * 100).toFixed(0)}% confidence)`;
      return { confidence, reason };
      
    default:
      reason = 'Unknown verification method';
      return { confidence: 0.3, reason };
  }
};

interface DiasporaVerificationProps {
  visible: boolean;
  onClose: () => void;
  profile: any;
  onVerificationUpdate: (level: number) => void;
}

type VerificationMethod = {
  id: 'passport' | 'residence' | 'social' | 'workplace' | 'selfie_liveness';
  title: string;
  description: string;
  level: number;
  icon: string;
  color: string;
  capture: 'library' | 'camera';
  mediaType: 'image' | 'video';
  submitLabel: string;
  category: 'fast' | 'document';
  helperLabel: string;
  reviewLabel: string;
  isRecommended?: boolean;
  challengeType?: string;
};

const LIVENESS_GUIDE_STEPS = [
  {
    title: 'Center your face',
    body: 'Hold the phone at eye level and keep your face inside the frame.',
    icon: 'scan-outline',
    progress: 0.25,
  },
  {
    title: 'Turn slightly left',
    body: 'Rotate your head a little to the left, like you are moving around a clock face.',
    icon: 'refresh-circle-outline',
    progress: 0.55,
  },
  {
    title: 'Blink once',
    body: 'Blink naturally while staying in frame so the review team can verify the challenge.',
    icon: 'eye-outline',
    progress: 0.82,
  },
  {
    title: 'Ready to record',
    body: 'Record one short clip and complete the movement smoothly from start to finish.',
    icon: 'videocam-outline',
    progress: 1,
  },
] as const;

export const DiasporaVerification: React.FC<DiasporaVerificationProps> = ({
  visible,
  onClose,
  profile,
  onVerificationUpdate,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>('selfie_liveness');
  const [showLivenessGuide, setShowLivenessGuide] = useState(false);
  const [showLiveLivenessCamera, setShowLiveLivenessCamera] = useState(false);
  const [livenessGuideStarted, setLivenessGuideStarted] = useState(false);
  const [livenessStepIndex, setLivenessStepIndex] = useState(0);
  const [liveCameraReady, setLiveCameraReady] = useState(false);
  const [liveRecording, setLiveRecording] = useState(false);
  const [liveRecordingProgress, setLiveRecordingProgress] = useState(0);
  const [liveHasFace, setLiveHasFace] = useState(false);
  const [liveFaceCentered, setLiveFaceCentered] = useState(false);
  const [liveTurnComplete, setLiveTurnComplete] = useState(false);
  const [liveBlinkComplete, setLiveBlinkComplete] = useState(false);
  const { status: verificationStatus, refreshStatus } = useVerificationStatus(profile?.id);
  const cameraRef = useRef<VisionCamera | null>(null);
  const device = useCameraDevice('front');
  const windowSize = useMemo(() => Dimensions.get('window'), []);
  const stopRecordingTriggeredRef = useRef(false);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verificationMethods: VerificationMethod[] = [
    {
      id: 'passport',
      title: 'Passport/Visa',
      description: 'Upload a photo of your passport or visa stamps',
      level: 2,
      icon: 'document-text-outline',
      color: '#4CAF50',
      capture: 'library',
      mediaType: 'image',
      submitLabel: 'Upload Verification Document',
      category: 'document',
      helperLabel: 'Best for official identity proof',
      reviewLabel: 'Manual review',
    },
    {
      id: 'residence',
      title: 'Residence Proof',
      description: 'Utility bill, lease agreement, or bank statement',
      level: 2,
      icon: 'home-outline',
      color: '#2196F3',
      capture: 'library',
      mediaType: 'image',
      submitLabel: 'Upload Verification Document',
      category: 'document',
      helperLabel: 'Best for location credibility',
      reviewLabel: 'Manual review',
    },
    {
      id: 'social',
      title: 'Social Media',
      description: 'Link your social media showing location history',
      level: 1,
      icon: 'logo-instagram',
      color: '#E91E63',
      capture: 'library',
      mediaType: 'image',
      submitLabel: 'Upload Verification Document',
      category: 'fast',
      helperLabel: 'Lightweight trust signal',
      reviewLabel: 'Manual review',
    },
    {
      id: 'workplace',
      title: 'Work/Study Proof',
      description: 'Employment letter or student ID from abroad',
      level: 2,
      icon: 'briefcase-outline',
      color: '#FF9800',
      capture: 'library',
      mediaType: 'image',
      submitLabel: 'Upload Verification Document',
      category: 'document',
      helperLabel: 'Strong proof for relocation or study abroad',
      reviewLabel: 'Manual review',
    },
    {
      id: 'selfie_liveness',
      title: 'Selfie Liveness',
      description: 'Record a short face-check video from the camera to confirm it is really you',
      level: 2,
      icon: 'scan-circle-outline',
      color: '#7C4DFF',
      capture: 'camera',
      mediaType: 'video',
      submitLabel: 'Record Face Check',
      category: 'fast',
      helperLabel: 'Fastest way to prove it is really you with a short guided video',
      reviewLabel: 'Fast review',
      isRecommended: true,
      challengeType: 'turn_left_blink',
    },
  ];
  const featuredMethod = verificationMethods.find((method) => method.id === 'selfie_liveness') ?? verificationMethods[0];
  const fastMethods = verificationMethods.filter(
    (method) => method.category === 'fast' && method.id !== featuredMethod.id,
  );
  const documentMethods = verificationMethods.filter((method) => method.category === 'document');
  const faceDetectionOptions = useMemo<FrameFaceDetectionOptions>(
    () => ({
      performanceMode: 'fast',
      landmarkMode: 'all',
      contourMode: 'none',
      classificationMode: 'all',
      trackingEnabled: true,
      minFaceSize: 0.18,
      cameraFacing: 'front',
      autoMode: true,
      windowWidth: windowSize.width,
      windowHeight: windowSize.height,
    }),
    [windowSize.height, windowSize.width],
  );
  const { detectFaces, stopListeners } = useFaceDetector(faceDetectionOptions);

  useEffect(() => {
    return () => {
      stopListeners();
    };
  }, [stopListeners]);

  useEffect(() => {
    if (!showLivenessGuide || !livenessGuideStarted) return;

    if (livenessStepIndex >= LIVENESS_GUIDE_STEPS.length - 1) return;

    const timeout = setTimeout(() => {
      setLivenessStepIndex((prev) => Math.min(prev + 1, LIVENESS_GUIDE_STEPS.length - 1));
    }, 1300);

    return () => clearTimeout(timeout);
  }, [showLivenessGuide, livenessGuideStarted, livenessStepIndex]);

  const resetLivenessGuide = () => {
    setShowLivenessGuide(false);
    setShowLiveLivenessCamera(false);
    setLivenessGuideStarted(false);
    setLivenessStepIndex(0);
    setLiveCameraReady(false);
    setLiveRecording(false);
    setLiveRecordingProgress(0);
    setLiveHasFace(false);
    setLiveFaceCentered(false);
    setLiveTurnComplete(false);
    setLiveBlinkComplete(false);
    stopRecordingTriggeredRef.current = false;
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const startLivenessGuide = () => {
    setLivenessStepIndex(0);
    setLivenessGuideStarted(true);
  };

  const submitVerificationAsset = async (
    method: VerificationMethod,
    asset: {
      uri: string;
      mimeType?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      width?: number;
      height?: number;
    },
  ) => {
    if (method.mediaType === 'image') {
      const isValidImage = await validateImageQuality(asset);
      if (!isValidImage.valid) {
        Alert.alert('Image Quality Issue', isValidImage.message);
        return false;
      }
    }

    const mimeType =
      asset.mimeType ??
      (method.mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
    const extension = (() => {
      if (asset.fileName && asset.fileName.includes('.')) {
        return asset.fileName.split('.').pop() || (method.mediaType === 'video' ? 'mp4' : 'jpg');
      }
      if (mimeType === 'video/quicktime') return 'mov';
      if (mimeType === 'video/mp4') return 'mp4';
      if (mimeType === 'image/png') return 'png';
      return method.mediaType === 'video' ? 'mp4' : 'jpg';
    })();
    const fileName = `verification_${method.id}_${Date.now()}.${extension}`;
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      type: mimeType,
      name: fileName,
    } as any);

    const { data, error } = await supabase.storage
      .from('verification-docs')
      .upload(`${profile.user_id}/${fileName}`, formData);

    if (error) throw error;

    let requestError: unknown = null;

    if (method.id === 'selfie_liveness') {
      const { error: rpcError } = await supabase.rpc(
        'rpc_submit_selfie_liveness_verification',
        {
          p_profile_id: profile.id,
          p_document_path: data.path,
          p_capture_mode: method.mediaType,
          p_challenge_type: method.challengeType ?? 'turn_left_blink',
          p_reference_asset_path: null,
        },
      );
      requestError = rpcError;
    } else {
      const autoScore = await calculateAutomatedScore(method.id, asset);
      const { error: insertError } = await supabase
        .from('verification_requests')
        .insert({
          user_id: profile.user_id,
          profile_id: profile.id,
          verification_type: method.id,
          document_url: data.path,
          auto_verification_score: autoScore.confidence,
          status: 'pending',
          reviewer_notes: `Pending review: ${autoScore.reason}`,
        });
      requestError = insertError;
    }

    if (requestError) throw requestError;

    Alert.alert(
      'Verification Submitted!',
      method.id === 'selfie_liveness'
        ? 'Your face-check video was submitted for review. You will be notified once it is approved.'
        : `Your ${method.title} verification is being reviewed. You'll be notified once approved.`
    );
    
    refreshStatus();
    onVerificationUpdate(profile?.verification_level || 0);
    onClose();
    return true;
  };

  const captureAndSubmitVerification = async (method: VerificationMethod) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow access to your photos.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled) return;

    await submitVerificationAsset(method, result.assets[0]);
  };

  const openLiveLivenessCamera = async () => {
    const [cameraPermission, microphonePermission] = await Promise.all([
      VisionCamera.requestCameraPermission(),
      VisionCamera.requestMicrophonePermission(),
    ]);

    if (cameraPermission !== 'granted' || microphonePermission !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Camera and microphone access are required to record the selfie-liveness challenge.',
      );
      return;
    }

    setShowLiveLivenessCamera(true);
  };

  const handleLiveFacesDetected = useCallback((faces: Face[]) => {
    const face = faces[0];

    if (!face) {
      setLiveHasFace(false);
      setLiveFaceCentered(false);
      if (!liveRecording) {
        setLiveRecordingProgress(0);
      }
      return;
    }

    setLiveHasFace(true);

    const centerX = face.bounds.x + face.bounds.width / 2;
    const centerY = face.bounds.y + face.bounds.height / 2;
    const centeredHorizontally = Math.abs(centerX - windowSize.width / 2) <= windowSize.width * 0.18;
    const centeredVertically = Math.abs(centerY - windowSize.height * 0.38) <= windowSize.height * 0.2;
    const isCentered = centeredHorizontally && centeredVertically;
    setLiveFaceCentered(isCentered);

    const yawProgress = Math.max(0, Math.min(1, Math.abs(face.yawAngle) / 18));
    const hasTurnedEnough = yawProgress >= 0.9;
    const hasBlink =
      face.leftEyeOpenProbability < 0.45 ||
      face.rightEyeOpenProbability < 0.45;

    if (hasTurnedEnough) {
      setLiveTurnComplete(true);
    }
    if (hasBlink && (hasTurnedEnough || liveTurnComplete)) {
      setLiveBlinkComplete(true);
    }

    const turnDone = hasTurnedEnough || liveTurnComplete;
    const blinkDone = (hasBlink && turnDone) || liveBlinkComplete;
    const nextProgress = !isCentered
      ? 0.08
      : Math.min(
          1,
          0.2 +
            yawProgress * 0.55 +
            (turnDone ? 0.1 : 0) +
            (blinkDone ? 0.15 : 0),
        );

    setLiveRecordingProgress(nextProgress);
  }, [liveBlinkComplete, liveRecording, liveTurnComplete, windowSize.height, windowSize.width]);
  const runLiveFaceDetection = useMemo(
    () =>
      Worklets.createRunOnJS((faces: Face[]) => {
        handleLiveFacesDetected(faces);
      }),
    [handleLiveFacesDetected],
  );
  const liveFrameProcessor = useFrameProcessor((frame) => {
    'worklet';

    runAsync(frame, () => {
      'worklet';
      const faces = detectFaces(frame);
      runLiveFaceDetection(faces);
    });
  }, [detectFaces, runLiveFaceDetection]);

  const beginLiveLivenessRecording = async () => {
    if (!cameraRef.current || liveRecording) return;

    try {
      setLiveRecording(true);
      setLiveRecordingProgress((prev) => (prev < 0.2 ? 0.2 : prev));
      stopRecordingTriggeredRef.current = false;

      recordingTimeoutRef.current = setTimeout(() => {
        if (!stopRecordingTriggeredRef.current) {
          stopRecordingTriggeredRef.current = true;
          void cameraRef.current?.stopRecording();
        }
      }, 4000);

      cameraRef.current.startRecording({
        fileType: 'mp4',
        onRecordingFinished: async (video) => {
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
          }
          setLiveRecording(false);
          setLoading(true);
          try {
            const success = await submitVerificationAsset(featuredMethod, {
              uri: video.path.startsWith('file://') ? video.path : `file://${video.path}`,
              mimeType: 'video/mp4',
              fileName: `selfie_liveness_${Date.now()}.mp4`,
              width: video.width,
              height: video.height,
            });

            if (success) {
              resetLivenessGuide();
            }
          } finally {
            setLoading(false);
          }
        },
        onRecordingError: (error) => {
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
          }
          setLiveRecording(false);
          console.error('Live liveness recording error:', error);
          Alert.alert('Recording Failed', 'Please try the face check again.');
        },
      });
    } catch (error) {
      setLiveRecording(false);
      console.error('Live liveness recording error:', error);
      Alert.alert('Recording Failed', 'Please try the face check again.');
    }
  };

  useEffect(() => {
    if (!liveRecording || liveRecordingProgress < 0.98 || stopRecordingTriggeredRef.current !== false) {
      return;
    }

    stopRecordingTriggeredRef.current = true;
    void cameraRef.current?.stopRecording();
  }, [liveRecording, liveRecordingProgress]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);

  const handleImageUpload = async (methodId: string) => {
    try {
      setLoading(true);

      const method = verificationMethods.find(item => item.id === methodId);
      if (!method) {
        Alert.alert('Verification Error', 'Unknown verification method.');
        return;
      }

      if (method.id === 'selfie_liveness') {
        setShowLivenessGuide(true);
        setLivenessGuideStarted(false);
        setLivenessStepIndex(0);
        return;
      }
      await captureAndSubmitVerification(method);

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
  const activeLivenessStep = LIVENESS_GUIDE_STEPS[livenessStepIndex];
  const ringSize = 220;
  const ringStroke = 12;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = activeLivenessStep.progress;
  const ringOffset = ringCircumference * (1 - ringProgress);
  const liveRingProgress = liveRecordingProgress > 0 ? liveRecordingProgress : 0.08;
  const liveRingOffset = ringCircumference * (1 - liveRingProgress);
  const livePrompt = !liveHasFace
    ? 'Center your face before you begin'
    : !liveFaceCentered
      ? 'Move into the guide ring'
      : !liveTurnComplete
        ? 'Turn your head gently toward 12:00'
        : !liveBlinkComplete
          ? 'Blink once to complete the challenge'
          : liveRecording
            ? 'Hold steady and finish strong'
            : 'Challenge complete. Record your clip';

  return (
    <>
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
            <Text style={styles.sectionEyebrow}>Trust on Betweener</Text>
            <Text style={styles.sectionTitle}>Why verify your profile?</Text>
            <Text style={styles.sectionIntro}>
              Verification makes your profile feel more real, lowers hesitation, and gives serious matches
              a stronger reason to engage.
            </Text>
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

          {/* Featured verification method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Start with the fastest option</Text>
            <TouchableOpacity
              style={[
                styles.featuredMethodCard,
                selectedMethod === featuredMethod.id && styles.selectedMethod,
              ]}
              onPress={() => setSelectedMethod(featuredMethod.id)}
              disabled={loading}
              activeOpacity={0.92}
            >
              <View style={styles.featuredHeader}>
                <View style={[styles.featuredIcon, { backgroundColor: `${featuredMethod.color}18` }]}>
                  <Ionicons name={featuredMethod.icon as any} size={28} color={featuredMethod.color} />
                </View>
                <View style={styles.featuredCopy}>
                  <View style={styles.featuredTitleRow}>
                    <Text style={styles.featuredTitle}>{featuredMethod.title}</Text>
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>Recommended</Text>
                    </View>
                  </View>
                  <Text style={styles.featuredDescription}>{featuredMethod.description}</Text>
                </View>
              </View>

              <View style={styles.featuredMetaRow}>
                <View style={[styles.metaPill, styles.metaPillPrimary]}>
                  <Ionicons name="flash-outline" size={14} color="#5B21B6" />
                  <Text style={[styles.metaPillText, styles.metaPillTextPrimary]}>{featuredMethod.helperLabel}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="time-outline" size={14} color="#666" />
                  <Text style={styles.metaPillText}>{featuredMethod.reviewLabel}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#666" />
                  <Text style={styles.metaPillText}>Level {featuredMethod.level}</Text>
                </View>
              </View>

              <View style={styles.howItWorksCard}>
                <Text style={styles.howItWorksTitle}>How it works</Text>
                <View style={styles.howItWorksSteps}>
                  <View style={styles.howItWorksStep}>
                    <View style={styles.howItWorksBadge}>
                      <Text style={styles.howItWorksBadgeText}>1</Text>
                    </View>
                    <Text style={styles.howItWorksStepText}>Open the front camera and start recording</Text>
                  </View>
                  <View style={styles.howItWorksDivider} />
                  <View style={styles.howItWorksStep}>
                    <View style={styles.howItWorksBadge}>
                      <Text style={styles.howItWorksBadgeText}>2</Text>
                    </View>
                    <Text style={styles.howItWorksStepText}>Turn slightly left and blink during the clip</Text>
                  </View>
                  <View style={styles.howItWorksDivider} />
                  <View style={styles.howItWorksStep}>
                    <View style={styles.howItWorksBadge}>
                      <Text style={styles.howItWorksBadgeText}>3</Text>
                    </View>
                    <Text style={styles.howItWorksStepText}>Submit for quick review</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Other verification methods */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other ways to verify</Text>
            {fastMethods.length > 0 ? (
              <View style={styles.methodGroup}>
                <Text style={styles.methodGroupTitle}>Lightweight trust signals</Text>
                {fastMethods.map((method) => (
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
                        <View style={styles.methodTopRow}>
                          <Text style={styles.methodTitle}>{method.title}</Text>
                          <View style={styles.reviewBadge}>
                            <Text style={styles.reviewBadgeText}>{method.reviewLabel}</Text>
                          </View>
                        </View>
                        <Text style={styles.methodDescription}>{method.description}</Text>
                        <Text style={styles.methodHelper}>{method.helperLabel}</Text>
                      </View>
                      <View style={styles.levelBadgeMuted}>
                        <Text style={styles.levelTextMuted}>L{method.level}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.methodGroup}>
              <Text style={styles.methodGroupTitle}>Document verification</Text>
              {documentMethods.map((method) => (
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
                      <View style={styles.methodTopRow}>
                        <Text style={styles.methodTitle}>{method.title}</Text>
                        <View style={styles.reviewBadge}>
                          <Text style={styles.reviewBadgeText}>{method.reviewLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.methodDescription}>{method.description}</Text>
                      <Text style={styles.methodHelper}>{method.helperLabel}</Text>
                    </View>
                    <View style={styles.levelBadgeMuted}>
                      <Text style={styles.levelTextMuted}>L{method.level}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Action Button */}
          {selectedMethod && (
            <View style={styles.submitSection}>
              <Text style={styles.submitHelper}>
                {verificationMethods.find((method) => method.id === selectedMethod)?.helperLabel}
              </Text>
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
                      : verificationMethods.find(method => method.id === selectedMethod)?.submitLabel ?? 'Upload Verification Document'
                  }
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color="#666" />
            <Text style={styles.disclaimerText}>
              Your documents are securely stored and only used for verification purposes. 
              Most reviews are completed within 1-2 business days.
            </Text>
          </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showLivenessGuide} animationType="slide" presentationStyle="fullScreen" onRequestClose={resetLivenessGuide}>
        <View style={styles.livenessScreen}>
          <View style={styles.livenessHeader}>
            <TouchableOpacity onPress={resetLivenessGuide} style={styles.livenessBackButton}>
              <Ionicons name="chevron-back" size={24} color="#1f2937" />
            </TouchableOpacity>
            <Text style={styles.livenessHeaderTitle}>Selfie liveness</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.livenessContent}>
            <Text style={styles.livenessEyebrow}>Guided challenge</Text>
            <Text style={styles.livenessTitle}>Complete one smooth motion to reach 100%</Text>
            <Text style={styles.livenessSubtitle}>
              This is a guided prep screen for your short verification clip. Follow the prompts, then record the challenge in one pass.
            </Text>

            <View style={styles.livenessRingWrap}>
              <Svg width={ringSize} height={ringSize}>
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke="#e5e7eb"
                  strokeWidth={ringStroke}
                  fill="none"
                />
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke="#7C4DFF"
                  strokeWidth={ringStroke}
                  fill="none"
                  strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              </Svg>
              <View style={styles.livenessRingCenter}>
                <Ionicons name={activeLivenessStep.icon as any} size={30} color="#7C4DFF" />
                <Text style={styles.livenessRingPercent}>{Math.round(ringProgress * 100)}%</Text>
                <Text style={styles.livenessRingCaption}>to 12:00</Text>
              </View>
            </View>

            <View style={styles.livenessStepCard}>
              <View style={styles.livenessStepTopRow}>
                <Text style={styles.livenessStepTitle}>{activeLivenessStep.title}</Text>
                <Text style={styles.livenessStepCount}>
                  {livenessStepIndex + 1}/{LIVENESS_GUIDE_STEPS.length}
                </Text>
              </View>
              <Text style={styles.livenessStepBody}>{activeLivenessStep.body}</Text>
            </View>

            <View style={styles.livenessTimeline}>
              {LIVENESS_GUIDE_STEPS.map((step, index) => {
                const completed = index < livenessStepIndex;
                const active = index === livenessStepIndex;
                return (
                  <View key={step.title} style={styles.livenessTimelineRow}>
                    <View
                      style={[
                        styles.livenessTimelineDot,
                        completed && styles.livenessTimelineDotComplete,
                        active && styles.livenessTimelineDotActive,
                      ]}
                    />
                    <Text
                      style={[
                        styles.livenessTimelineText,
                        (completed || active) && styles.livenessTimelineTextActive,
                      ]}
                    >
                      {step.title}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.livenessFooter}>
              {!livenessGuideStarted ? (
                <TouchableOpacity style={styles.livenessPrimaryButton} onPress={startLivenessGuide}>
                  <Text style={styles.livenessPrimaryButtonText}>Start challenge</Text>
                </TouchableOpacity>
              ) : livenessStepIndex < LIVENESS_GUIDE_STEPS.length - 1 ? (
                <View style={styles.livenessPendingBadge}>
                  <Ionicons name="time-outline" size={16} color="#7C4DFF" />
                  <Text style={styles.livenessPendingText}>Advancing through the challenge...</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.livenessPrimaryButton, loading && styles.submitButtonDisabled]}
                    onPress={openLiveLivenessCamera}
                    disabled={loading}
                  >
                    <Text style={styles.livenessPrimaryButtonText}>
                      Open live camera
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.livenessSecondaryButton}
                    onPress={() => {
                      setLivenessGuideStarted(false);
                      setLivenessStepIndex(0);
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.livenessSecondaryButtonText}>Run challenge again</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showLiveLivenessCamera} animationType="slide" presentationStyle="fullScreen" onRequestClose={resetLivenessGuide}>
        <View style={styles.liveCameraScreen}>
          {device ? (
            <VisionCamera
              ref={cameraRef}
              style={styles.liveCamera}
              device={device}
              isActive={showLiveLivenessCamera}
              video
              audio
              preview
              frameProcessor={liveFrameProcessor}
              onInitialized={() => setLiveCameraReady(true)}
              onError={(error) => {
                console.error('Live liveness camera error:', error);
                setLiveCameraReady(false);
              }}
            />
          ) : (
            <View style={[styles.liveCamera, styles.liveCameraFallback]}>
              <Ionicons name="videocam-off-outline" size={44} color="#fff" />
              <Text style={styles.liveCameraFallbackTitle}>Front camera unavailable</Text>
              <Text style={styles.liveCameraFallbackText}>
                This device could not start the live face-check camera.
              </Text>
            </View>
          )}

          <View style={styles.liveCameraOverlay}>
            <View style={styles.liveCameraTopBar}>
              <TouchableOpacity onPress={resetLivenessGuide} style={styles.liveCameraClose}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.liveCameraBadge}>
                <Text style={styles.liveCameraBadgeText}>Selfie liveness</Text>
              </View>
              <View style={styles.liveCameraStatusWrap}>
                <Text style={styles.liveCameraStatusText}>
                  {!device ? 'No camera' : liveRecording ? 'Recording' : 'Ready'}
                </Text>
              </View>
            </View>

            <View style={styles.liveCameraCenter}>
              <View style={styles.liveRingWrap}>
                <Svg width={ringSize} height={ringSize}>
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={ringStroke}
                    fill="none"
                  />
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    stroke="#8b5cf6"
                    strokeWidth={ringStroke}
                    fill="none"
                    strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                    strokeDashoffset={liveRingOffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                  />
                </Svg>
                <View style={styles.liveRingCenter}>
                  <Text style={styles.liveRingPercent}>{Math.round(liveRingProgress * 100)}%</Text>
                  <Text style={styles.liveRingHint}>toward 12:00</Text>
                </View>
              </View>
              <Text style={styles.livePromptTitle}>{livePrompt}</Text>
              <Text style={styles.livePromptBody}>
                {liveRecording
                  ? 'Follow the motion smoothly while the ring fills around you.'
                  : 'When you are ready, start the short face-check recording and perform the movement in one take.'}
              </Text>
            </View>

            <View style={styles.liveCameraFooter}>
              <View style={styles.liveChecklistPill}>
                <Ionicons name="scan-outline" size={16} color="#fff" />
                <Text style={styles.liveChecklistText}>Face centered</Text>
              </View>
              <View style={styles.liveChecklistPill}>
                <Ionicons name="refresh-circle-outline" size={16} color="#fff" />
                <Text style={styles.liveChecklistText}>Turn left</Text>
              </View>
              <View style={styles.liveChecklistPill}>
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={styles.liveChecklistText}>Blink</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.liveRecordButton,
                  (!device || !liveCameraReady || liveRecording || loading) && styles.liveRecordButtonDisabled,
                ]}
                onPress={beginLiveLivenessRecording}
                disabled={!device || !liveCameraReady || liveRecording || loading}
              >
                <View style={[styles.liveRecordButtonInner, liveRecording && styles.liveRecordButtonInnerActive]} />
              </TouchableOpacity>
              <Text style={styles.liveRecordButtonLabel}>
                {liveRecording ? 'Recording...' : 'Tap to record'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  livenessScreen: {
    flex: 1,
    backgroundColor: '#f7f4ff',
  },
  livenessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 18,
  },
  livenessBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  livenessHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  livenessContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  livenessEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#7C4DFF',
    marginBottom: 8,
  },
  livenessTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#111827',
  },
  livenessSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#6b7280',
  },
  livenessRingWrap: {
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livenessRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  livenessRingPercent: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111827',
  },
  livenessRingCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C4DFF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  livenessStepCard: {
    marginTop: 28,
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ece7ff',
  },
  livenessStepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  livenessStepTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  livenessStepCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C4DFF',
  },
  livenessStepBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  livenessTimeline: {
    marginTop: 22,
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.8)',
    gap: 10,
  },
  livenessTimelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  livenessTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#d1d5db',
  },
  livenessTimelineDotActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#7C4DFF',
  },
  livenessTimelineDotComplete: {
    backgroundColor: '#10b981',
  },
  livenessTimelineText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  livenessTimelineTextActive: {
    color: '#1f2937',
  },
  livenessFooter: {
    marginTop: 'auto',
    paddingTop: 20,
    gap: 12,
  },
  livenessPrimaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#7C4DFF',
  },
  livenessPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  livenessSecondaryButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#fff',
  },
  livenessSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6d28d9',
  },
  livenessPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#efe7ff',
  },
  livenessPendingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6d28d9',
  },
  liveCameraScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  liveCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  liveCameraFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
    backgroundColor: '#111827',
  },
  liveCameraFallbackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  liveCameraFallbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  liveCameraOverlay: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 28,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
  },
  liveCameraTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  liveCameraClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  liveCameraBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  liveCameraBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  liveCameraStatusWrap: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(124,77,255,0.84)',
  },
  liveCameraStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  liveCameraCenter: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  liveRingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRingPercent: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
  },
  liveRingHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#ddd6fe',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  livePromptTitle: {
    marginTop: 24,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  livePromptBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.84)',
    textAlign: 'center',
  },
  liveCameraFooter: {
    alignItems: 'center',
    gap: 12,
  },
  liveChecklistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  liveChecklistText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  liveRecordButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: 8,
  },
  liveRecordButtonDisabled: {
    opacity: 0.55,
  },
  liveRecordButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ef4444',
  },
  liveRecordButtonInnerActive: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  liveRecordButtonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
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
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#7C4DFF',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  sectionIntro: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: -6,
    marginBottom: 14,
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
  featuredMethodCard: {
    borderWidth: 1,
    borderColor: '#e5dcff',
    backgroundColor: '#faf7ff',
    borderRadius: 20,
    padding: 18,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featuredIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredCopy: {
    flex: 1,
    marginLeft: 14,
  },
  featuredTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  recommendedBadge: {
    backgroundColor: '#efe7ff',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  recommendedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6d28d9',
    letterSpacing: 0.2,
  },
  featuredDescription: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
  },
  featuredMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  howItWorksCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9ddff',
    backgroundColor: '#fff',
    padding: 14,
  },
  howItWorksTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: '#6d28d9',
    marginBottom: 12,
  },
  howItWorksSteps: {
    gap: 10,
  },
  howItWorksStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  howItWorksBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#efe7ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  howItWorksBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6d28d9',
  },
  howItWorksStepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#555',
    fontWeight: '600',
  },
  howItWorksDivider: {
    marginLeft: 11,
    width: 2,
    height: 10,
    backgroundColor: '#e9ddff',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaPillPrimary: {
    borderColor: '#d8b4fe',
    backgroundColor: '#f5edff',
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  metaPillTextPrimary: {
    color: '#5b21b6',
  },
  methodGroup: {
    marginBottom: 16,
  },
  methodGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  methodCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  selectedMethod: {
    borderColor: '#8b5cf6',
    backgroundColor: '#faf7ff',
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  methodTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
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
    lineHeight: 20,
  },
  methodHelper: {
    fontSize: 12,
    color: '#8a8a8a',
    marginTop: 6,
    lineHeight: 17,
  },
  reviewBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  reviewBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  levelBadgeMuted: {
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#dbe4ff',
    backgroundColor: '#f5f8ff',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  levelTextMuted: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '700',
  },
  submitSection: {
    marginBottom: 24,
  },
  submitHelper: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: '#7C4DFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
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
