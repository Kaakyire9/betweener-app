import { Colors } from '@/constants/theme';
import { useColorScheme as useAppColorScheme } from '@/hooks/use-color-scheme';
import { useVerificationStatus } from '@/hooks/use-verification-status';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RNSvg, { Circle, Path } from 'react-native-svg';
import { Worklets } from 'react-native-worklets-core';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useFaceDetector, type Face, type FrameFaceDetectionOptions } from 'react-native-vision-camera-face-detector';
import { Camera as VisionCamera, runAsync, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Alert,
    Dimensions,
    LayoutChangeEvent,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
  View
} from 'react-native';

const AnimatedPath = Animated.createAnimatedComponent(Path);

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

const LIVE_GUIDE_WIDTH = 276;
const LIVE_GUIDE_HEIGHT = 304;
const LIVE_GUIDE_STROKE = 10;

const cubicPoint = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
};

const buildFaceGuide = (width: number, height: number) => {
  const cx = width / 2;
  const topY = 18;
  const bottomY = height - 20;
  const rightX = width - 30;
  const leftX = 30;
  const upperMidY = height * 0.32;
  const lowerMidY = height * 0.70;
  const foreheadCurve = width * 0.18;
  const chinCurve = width * 0.19;
  const shoulderLift = 34;

  const segments = [
    [
      { x: cx, y: topY },
      { x: cx + foreheadCurve, y: topY - 2 },
      { x: rightX, y: upperMidY - shoulderLift },
      { x: rightX, y: upperMidY },
    ],
    [
      { x: rightX, y: upperMidY },
      { x: rightX, y: lowerMidY },
      { x: cx + chinCurve, y: bottomY - 6 },
      { x: cx, y: bottomY },
    ],
    [
      { x: cx, y: bottomY },
      { x: cx - chinCurve, y: bottomY - 6 },
      { x: leftX, y: lowerMidY },
      { x: leftX, y: upperMidY },
    ],
    [
      { x: leftX, y: upperMidY },
      { x: leftX, y: upperMidY - shoulderLift },
      { x: cx - foreheadCurve, y: topY - 2 },
      { x: cx, y: topY },
    ],
  ] as const;

  const d = [
    `M ${segments[0][0].x} ${segments[0][0].y}`,
    ...segments.map(
      ([_start, c1, c2, end]) =>
        `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    ),
  ].join(' ');

  let length = 0;
  for (const [p0, p1, p2, p3] of segments) {
    let prev = p0;
    for (let i = 1; i <= 40; i += 1) {
      const t = i / 40;
      const point = {
        x: cubicPoint(p0.x, p1.x, p2.x, p3.x, t),
        y: cubicPoint(p0.y, p1.y, p2.y, p3.y, t),
      };
      length += Math.hypot(point.x - prev.x, point.y - prev.y);
      prev = point;
    }
  }

  return { d, length };
};

const approachSignal = (current: number, target: number, risePerSecond: number, fallPerSecond: number, dt: number) => {
  if (target > current) {
    return Math.min(target, current + risePerSecond * dt);
  }

  return Math.max(target, current - fallPerSecond * dt);
};

const applyHysteresis = (currentState: boolean, confidence: number, engageAt: number, releaseAt: number) => {
  if (currentState) {
    return confidence >= releaseAt;
  }

  return confidence >= engageAt;
};

type LiveChecklistPillProps = {
  completed: boolean;
  icon: string;
  label: string;
  tint: string;
};

const LiveChecklistPill: React.FC<LiveChecklistPillProps> = ({
  completed,
  icon,
  label,
  tint,
}) => {
  const scale = useSharedValue(1);
  const glow = useSharedValue(completed ? 0.5 : 0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (completed) {
      scale.value = withSequence(
        withTiming(1.08, { duration: 170, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 11, stiffness: 220 }),
      );
      glow.value = withSequence(
        withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(0.68, { duration: 420, easing: Easing.out(Easing.quad) }),
      );
    } else {
      scale.value = withTiming(1, { duration: 150 });
      glow.value = withTiming(0, { duration: 150 });
    }
  }, [completed, glow, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: glow.value * 0.32,
    shadowRadius: 8 + glow.value * 10,
    shadowOffset: { width: 0, height: 4 + glow.value * 4 },
  }));

  return (
    <Animated.View
      style={[
        styles.liveChecklistPill,
        completed && styles.liveChecklistPillCompleted,
        completed && { shadowColor: tint },
        animatedStyle,
      ]}
    >
      <Ionicons
        name={(completed ? 'checkmark-circle' : icon) as any}
        size={16}
        color="#fff"
      />
      <Text style={styles.liveChecklistText}>{label}</Text>
    </Animated.View>
  );
};

export const DiasporaVerification: React.FC<DiasporaVerificationProps> = ({
  visible,
  onClose,
  profile,
  onVerificationUpdate,
}) => {
  const colorScheme = useAppColorScheme();
  const theme = colorScheme === 'dark' ? Colors.dark : Colors.light;
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>('selfie_liveness');
  const [showLivenessGuide, setShowLivenessGuide] = useState(false);
  const [showLiveLivenessCamera, setShowLiveLivenessCamera] = useState(false);
  const [liveCameraReady, setLiveCameraReady] = useState(false);
  const [liveRecording, setLiveRecording] = useState(false);
  const [liveCameraIssue, setLiveCameraIssue] = useState<string | null>(null);
  const [liveRecordingProgress, setLiveRecordingProgress] = useState(0);
  const [liveHasFace, setLiveHasFace] = useState(false);
  const [liveFaceCentered, setLiveFaceCentered] = useState(false);
  const [liveTurnComplete, setLiveTurnComplete] = useState(false);
  const [liveBlinkComplete, setLiveBlinkComplete] = useState(false);
  const [liveChallengeReady, setLiveChallengeReady] = useState(false);
  const [liveGuideLayout, setLiveGuideLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { status: verificationStatus, refreshStatus } = useVerificationStatus(profile?.id);
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<VisionCamera | null>(null);
  const liveGuideRef = useRef<View | null>(null);
  const liveSignalRef = useRef({
    center: 0,
    turn: 0,
    blink: 0,
    lastTimestamp: Date.now(),
  });
  const liveMissingFaceSinceRef = useRef<number | null>(null);
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

  const resetLivenessGuide = () => {
    setShowLivenessGuide(false);
    setShowLiveLivenessCamera(false);
    setLiveCameraReady(false);
    setLiveRecording(false);
    setLiveCameraIssue(null);
    setLiveRecordingProgress(0);
    setLiveHasFace(false);
    setLiveFaceCentered(false);
    setLiveTurnComplete(false);
    setLiveBlinkComplete(false);
    setLiveChallengeReady(false);
    setLiveGuideLayout(null);
    liveSignalRef.current = {
      center: 0,
      turn: 0,
      blink: 0,
      lastTimestamp: Date.now(),
    };
    liveMissingFaceSinceRef.current = null;
    stopRecordingTriggeredRef.current = false;
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
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
    setLiveCameraIssue(null);
    const cameraPermission = await VisionCamera.requestCameraPermission();

    if (cameraPermission !== 'granted') {
      setLiveCameraIssue('Camera permission was not granted.');
      Alert.alert(
        'Permission needed',
        'Camera access is required to record the selfie-liveness challenge.',
      );
      return;
    }

    const microphonePermission = await VisionCamera.requestMicrophonePermission();
    if (microphonePermission !== 'granted') {
      setLiveCameraIssue('Microphone permission was not granted.');
      Alert.alert(
        'Permission needed',
        'Microphone access is required so the face-check video can record properly in production builds.',
      );
      return;
    }

    setLiveCameraReady(false);
    setShowLiveLivenessCamera(true);
  };

  const handleLiveGuideLayout = useCallback((event: LayoutChangeEvent) => {
    const fallback = event.nativeEvent.layout;
    requestAnimationFrame(() => {
      liveGuideRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setLiveGuideLayout({ x, y, width, height });
        } else {
          setLiveGuideLayout({
            x: (windowSize.width - fallback.width) / 2,
            y: fallback.y,
            width: fallback.width,
            height: fallback.height,
          });
        }
      });
    });
  }, [windowSize.width]);

  const handleLiveFacesDetected = useCallback((faces: Face[]) => {
    const now = Date.now();
    const previousTimestamp = liveSignalRef.current.lastTimestamp;
    const dt = Math.min(0.12, Math.max(0.016, (now - previousTimestamp) / 1000));
    liveSignalRef.current.lastTimestamp = now;

    const face = faces[0];

    if (!face) {
      setLiveHasFace(false);
      if (liveChallengeReady && !liveRecording) {
        if (liveMissingFaceSinceRef.current == null) {
          liveMissingFaceSinceRef.current = now;
        }
        if (now - liveMissingFaceSinceRef.current < 1200) {
          setLiveRecordingProgress(1);
          return;
        }
      }
      liveMissingFaceSinceRef.current = null;
      setLiveFaceCentered(false);
      setLiveTurnComplete(false);
      setLiveBlinkComplete(false);
      setLiveChallengeReady(false);
      liveSignalRef.current.center = approachSignal(liveSignalRef.current.center, 0, 0, 5.4, dt);
      liveSignalRef.current.turn = approachSignal(liveSignalRef.current.turn, 0, 0, 6.2, dt);
      liveSignalRef.current.blink = approachSignal(liveSignalRef.current.blink, 0, 0, 7.2, dt);
      if (!liveRecording) {
        setLiveRecordingProgress(Math.max(0, 0.08 + liveSignalRef.current.center * 0.14));
      }
      return;
    }

    setLiveHasFace(true);
    liveMissingFaceSinceRef.current = null;

    const faceLeft = face.bounds.x;
    const faceTop = face.bounds.y;
    const faceCenterX = faceLeft + face.bounds.width / 2;
    const faceCenterY = faceTop + face.bounds.height / 2;

    const guide = liveGuideLayout ?? {
      x: (windowSize.width - LIVE_GUIDE_WIDTH) / 2,
      y: windowSize.height * 0.16,
      width: LIVE_GUIDE_WIDTH,
      height: LIVE_GUIDE_HEIGHT,
    };
    const guideCenterX = guide.x + guide.width / 2;
    const guideCenterY = guide.y + guide.height * 0.58;
    const normalizedX = Math.abs(faceCenterX - guideCenterX) / (guide.width * 0.40);
    const normalizedY = Math.abs(faceCenterY - guideCenterY) / (guide.height * 0.46);
    const centeredByOval = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
    const withinGuideShell =
      faceCenterX >= guide.x + guide.width * 0.20 &&
      faceCenterX <= guide.x + guide.width * 0.80 &&
      faceCenterY >= guide.y + guide.height * 0.34 &&
      faceCenterY <= guide.y + guide.height * 0.76;
    const faceFillIsReasonable =
      face.bounds.width >= guide.width * 0.22 &&
      face.bounds.width <= guide.width * 0.82 &&
      face.bounds.height >= guide.height * 0.22 &&
      face.bounds.height <= guide.height * 0.90;
    const rawCentered = centeredByOval && withinGuideShell && faceFillIsReasonable;

    if (liveChallengeReady && !liveRecording) {
      setLiveFaceCentered(true);
      setLiveTurnComplete(true);
      setLiveBlinkComplete(true);
      setLiveRecordingProgress(1);
      return;
    }

    const yawProgress = Math.max(0, Math.min(1, Math.abs(face.yawAngle) / 18));
    const hasBlink =
      face.leftEyeOpenProbability < 0.55 ||
      face.rightEyeOpenProbability < 0.55;
    const centerTarget = rawCentered ? 1 : 0;
    liveSignalRef.current.center = approachSignal(
      liveSignalRef.current.center,
      centerTarget,
      3.9,
      3.1,
      dt,
    );

    const nextCentered = applyHysteresis(
      liveFaceCentered,
      liveSignalRef.current.center,
      0.72,
      0.46,
    );
    setLiveFaceCentered(nextCentered);

    const turnTarget = nextCentered ? yawProgress : 0;
    liveSignalRef.current.turn = approachSignal(
      liveSignalRef.current.turn,
      turnTarget,
      3.1,
      2.8,
      dt,
    );

    const nextTurnComplete = nextCentered
      ? applyHysteresis(liveTurnComplete, liveSignalRef.current.turn, 0.84, 0.52)
      : false;
    setLiveTurnComplete(nextTurnComplete);

    if (nextCentered && nextTurnComplete && hasBlink) {
      liveSignalRef.current.blink = 1;
    } else {
      liveSignalRef.current.blink = approachSignal(
        liveSignalRef.current.blink,
        0,
        0,
        1.4,
        dt,
      );
    }

    const nextBlinkComplete = nextCentered
      ? applyHysteresis(liveBlinkComplete, liveSignalRef.current.blink, 0.76, 0.34)
      : false;
    setLiveBlinkComplete(nextBlinkComplete);

    if (nextCentered && nextTurnComplete && nextBlinkComplete) {
      setLiveChallengeReady(true);
    }

    const nextProgress = !nextCentered
      ? 0.08 + liveSignalRef.current.center * 0.14
      : nextBlinkComplete
        ? 1
        : nextTurnComplete
          ? 0.80 + liveSignalRef.current.blink * 0.18
          : 0.24 + liveSignalRef.current.turn * 0.48;

    setLiveRecordingProgress(Math.max(0.08, Math.min(1, nextProgress)));
  }, [liveBlinkComplete, liveChallengeReady, liveFaceCentered, liveGuideLayout, liveRecording, liveTurnComplete, windowSize.height, windowSize.width]);
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
    if (liveRecording) return;
    if (!device) {
      setLiveCameraIssue('The front camera could not be started on this device.');
      Alert.alert('Camera unavailable', 'The front camera could not be started on this device.');
      return;
    }
    if (!cameraRef.current || !liveCameraReady) {
      setLiveCameraIssue('The camera is still starting.');
      Alert.alert('Camera warming up', 'Please wait a moment for the camera to finish starting.');
      return;
    }
    if (!liveHasFace) {
      Alert.alert('Face not ready', 'Bring your face back into the guide ring before recording.');
      return;
    }
    if (!liveChallengeReady) {
      Alert.alert('Finish the challenge first', 'Turn slightly left and blink once before recording the face check.');
      return;
    }

    try {
      setLiveRecording(true);
      setLiveRecordingProgress(1);
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
  const ringSize = 220;
  const ringStroke = 12;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const liveGuideWidth = LIVE_GUIDE_WIDTH;
  const liveGuideHeight = LIVE_GUIDE_HEIGHT;
  const liveGuideStroke = LIVE_GUIDE_STROKE;
  const prepRingProgress = 1;
  const prepRingOffset = ringCircumference * (1 - prepRingProgress);
  const liveRingProgress = liveRecordingProgress > 0 ? liveRecordingProgress : 0.08;
  const liveGuide = useMemo(() => buildFaceGuide(liveGuideWidth, liveGuideHeight), [liveGuideHeight, liveGuideWidth]);
  const liveChallengeComplete = liveChallengeReady || (liveHasFace && liveFaceCentered && liveTurnComplete && liveBlinkComplete);
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
  const livePromptBody = liveRecording
    ? 'Follow the motion smoothly while the ring fills around you.'
    : liveChallengeComplete
      ? 'Your face check is ready. Record one short clip and complete the movement in a single take.'
      : !liveHasFace
        ? 'Position yourself inside the guide ring so we can start reading your challenge.'
        : !liveFaceCentered
          ? 'Move your face into the guide ring until the camera locks on.'
          : !liveTurnComplete
            ? 'Turn a little left until the progress ring moves close to 12:00.'
            : 'Blink once while staying in frame to finish the challenge.';
  const liveChecklist = [
    { key: 'center', icon: 'scan-outline', label: 'Face centered', completed: liveChallengeComplete || (liveHasFace && liveFaceCentered) },
    { key: 'turn', icon: 'refresh-circle-outline', label: 'Turn left', completed: liveChallengeComplete || liveTurnComplete },
    { key: 'blink', icon: 'eye-outline', label: 'Blink', completed: liveChallengeComplete || liveBlinkComplete },
  ] as const;
  const [liveDisplayedProgress, setLiveDisplayedProgress] = useState(Math.round(liveRingProgress * 100));
  const liveAnimatedProgress = useSharedValue(liveRingProgress);
  const liveRingPulse = useSharedValue(0);
  const livePromptReveal = useSharedValue(1);
  const livePromptCompleteAccent = useSharedValue(0);
  const liveCompletedRef = useRef(liveChallengeComplete);
  const sheetSurface = isDark ? theme.backgroundSubtle : '#fffdf9';
  const elevatedSurface = isDark ? '#182626' : '#fffaf4';
  const heroSurface = isDark ? '#1b2929' : '#fff7ef';
  const sectionBorder = theme.outline;
  const titleColor = theme.text;
  const bodyColor = theme.textMuted;
  const softTintSurface = isDark ? `${theme.tint}22` : `${theme.tint}14`;
  const softAccentSurface = isDark ? `${theme.accent}30` : `${theme.accent}14`;
  const selectedCardStyle = {
    borderColor: theme.accent,
    backgroundColor: isDark ? '#1c272d' : '#fff7ef',
  } as const;

  useEffect(() => {
    liveAnimatedProgress.value = withTiming(liveRingProgress, {
      duration: liveRecording ? 110 : liveChallengeComplete ? 280 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [liveAnimatedProgress, liveChallengeComplete, liveRecording, liveRingProgress]);

  useAnimatedReaction(
    () => Math.round(liveAnimatedProgress.value * 100),
    (value, previous) => {
      if (value !== previous) {
        runOnJS(setLiveDisplayedProgress)(value);
      }
    },
    [setLiveDisplayedProgress],
  );

  useEffect(() => {
    livePromptReveal.value = 0;
    livePromptReveal.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [livePrompt, livePromptBody, livePromptReveal]);

  useEffect(() => {
    if (liveChallengeComplete && !liveCompletedRef.current) {
      liveRingPulse.value = 0;
      livePromptCompleteAccent.value = 0;
      liveRingPulse.value = withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 820, easing: Easing.out(Easing.quad) }),
      );
      livePromptCompleteAccent.value = withSequence(
        withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 520, easing: Easing.out(Easing.quad) }),
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    liveCompletedRef.current = liveChallengeComplete;
  }, [liveChallengeComplete, livePromptCompleteAccent, liveRingPulse]);

  const liveRingAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: liveGuide.length * (1 - liveAnimatedProgress.value),
  }));

  const liveRingWrapAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + liveRingPulse.value * 0.035 }],
    shadowOpacity: 0.18 + liveRingPulse.value * 0.16,
    shadowRadius: 18 + liveRingPulse.value * 14,
  }));

  const livePromptAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + livePromptReveal.value * 0.28,
    transform: [
      { translateY: (1 - livePromptReveal.value) * 10 - livePromptCompleteAccent.value * 4 },
      { scale: 1 + livePromptCompleteAccent.value * 0.018 },
    ] as any,
  }));

  if (showLiveLivenessCamera) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={resetLivenessGuide}
      >
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
              onInitialized={() => {
                setLiveCameraIssue(null);
                setLiveCameraReady(true);
              }}
              onStarted={() => {
                setLiveCameraIssue(null);
                setLiveCameraReady(true);
              }}
              onPreviewStarted={() => {
                setLiveCameraIssue(null);
                setLiveCameraReady(true);
              }}
              onError={(error) => {
                console.error('Live liveness camera error:', error);
                setLiveCameraReady(false);
                setLiveCameraIssue(error?.message || 'The live liveness camera failed to start.');
              }}
            />
          ) : (
            <View style={[styles.liveCamera, styles.liveCameraFallback]}>
              <Ionicons name="videocam-off-outline" size={44} color="#fff" />
              <Text style={styles.liveCameraFallbackTitle}>Front camera unavailable</Text>
              <Text style={styles.liveCameraFallbackText}>
                {liveCameraIssue || 'This device could not start the live face-check camera.'}
              </Text>
            </View>
          )}

          <View style={styles.liveCameraOverlay}>
            <LinearGradient
              colors={['rgba(8,12,18,0.62)', 'rgba(8,12,18,0.12)', 'rgba(8,12,18,0.68)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.liveCameraGradient}
              pointerEvents="none"
            />
            <View style={styles.liveCameraTopBar}>
              <TouchableOpacity onPress={resetLivenessGuide} style={styles.liveCameraClose}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.liveCameraBadge}>
                <Text style={styles.liveCameraBadgeText}>Selfie liveness</Text>
              </View>
              <View style={styles.liveCameraStatusWrap}>
                <Text style={styles.liveCameraStatusText}>
                  {!device ? 'No camera' : liveRecording ? 'Recording' : liveCameraIssue ? 'Needs attention' : liveCameraReady ? 'Ready' : 'Starting'}
                </Text>
              </View>
            </View>

            <View style={styles.liveCameraCenter}>
              <Animated.View
                ref={liveGuideRef}
                onLayout={handleLiveGuideLayout}
                style={[styles.liveRingWrap, liveRingWrapAnimatedStyle]}
              >
                <RNSvg width={liveGuideWidth} height={liveGuideHeight}>
                  <Path
                    d={liveGuide.d}
                    stroke={`${theme.accent}18`}
                    strokeWidth={liveGuideStroke + 6}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <Path
                    d={liveGuide.d}
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth={liveGuideStroke}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <AnimatedPath
                    d={liveGuide.d}
                    stroke={theme.accent}
                    strokeWidth={liveGuideStroke}
                    fill="none"
                    strokeDasharray={`${liveGuide.length} ${liveGuide.length}`}
                    animatedProps={liveRingAnimatedProps}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d={liveGuide.d}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={2}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </RNSvg>
                <View style={styles.liveRingCenter}>
                  <Text style={styles.liveRingPercent}>{liveDisplayedProgress}%</Text>
                  <Text style={styles.liveRingHint}>toward 12:00</Text>
                </View>
              </Animated.View>
              <Animated.View style={[styles.livePromptWrap, livePromptAnimatedStyle]}>
                <Text style={styles.livePromptTitle}>{livePrompt}</Text>
                <Text style={styles.livePromptBody}>{livePromptBody}</Text>
              </Animated.View>
            </View>

            <View style={styles.liveCameraFooter}>
              <View style={styles.liveFooterDock}>
                <View style={styles.liveChecklistRow}>
                  {liveChecklist.map((item) => (
                    <LiveChecklistPill
                      key={item.key}
                      completed={item.completed}
                      icon={item.icon}
                      label={item.label}
                      tint={theme.accent}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.liveRecordButton,
                    (!device || liveRecording || loading) && styles.liveRecordButtonDisabled,
                  ]}
                  onPress={beginLiveLivenessRecording}
                  disabled={!device || liveRecording || loading}
                >
                  <View style={[styles.liveRecordButtonInner, liveRecording && styles.liveRecordButtonInnerActive]} />
                </TouchableOpacity>
                <Text style={styles.liveRecordButtonLabel}>
                  {liveRecording
                    ? 'Recording...'
                    : liveCameraIssue
                      ? liveCameraIssue
                    : !liveCameraReady
                      ? 'Camera starting...'
                      : liveChallengeComplete
                        ? 'Tap to record'
                        : 'Complete the challenge first'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (showLivenessGuide) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={resetLivenessGuide}
      >
        <View style={[styles.livenessScreen, { backgroundColor: theme.background }]}>
          <View style={[styles.livenessHeader, { paddingTop: Math.max(insets.top + 8, 28) }]}>
            <TouchableOpacity
              onPress={resetLivenessGuide}
              style={[styles.livenessBackButton, { backgroundColor: elevatedSurface, borderColor: sectionBorder }]}
            >
              <Ionicons name="chevron-back" size={24} color={titleColor} />
            </TouchableOpacity>
            <Text style={[styles.livenessHeaderTitle, { color: titleColor }]}>Selfie liveness</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            style={styles.livenessScroll}
            contentContainerStyle={[
              styles.livenessContent,
              { paddingBottom: Math.max(insets.bottom + 28, 40) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.livenessEyebrow, { color: theme.accent }]}>Before you record</Text>
            <Text style={[styles.livenessTitle, { color: titleColor }]}>Get ready for a quick face check</Text>
            <Text style={[styles.livenessSubtitle, { color: bodyColor }]}>
              Use the front camera, keep your face in frame, then turn slightly left and blink once. The live camera screen will track the real challenge for you.
            </Text>

            <View style={styles.livenessRingWrap}>
              <RNSvg width={ringSize} height={ringSize}>
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke={sectionBorder}
                  strokeWidth={ringStroke}
                  fill="none"
                />
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke={theme.tint}
                  strokeWidth={ringStroke}
                  fill="none"
                  strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                  strokeDashoffset={prepRingOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              </RNSvg>
              <View style={styles.livenessRingCenter}>
                <Ionicons name="videocam-outline" size={30} color={theme.tint} />
                <Text style={[styles.livenessRingPercent, { color: titleColor }]}>3 steps</Text>
                <Text style={[styles.livenessRingCaption, { color: theme.accent }]}>before recording</Text>
              </View>
            </View>

            <View style={[styles.livenessStepCard, { backgroundColor: elevatedSurface, borderColor: sectionBorder }]}>
              <View style={styles.livenessStepTopRow}>
                <Text style={[styles.livenessStepTitle, { color: titleColor }]}>What you will do on camera</Text>
              </View>
              <Text style={[styles.livenessStepBody, { color: bodyColor }]}>
                The live camera will only unlock recording after it sees your face centered, your slight left turn, and one blink.
              </Text>
            </View>

            <View style={[styles.livenessTimeline, { backgroundColor: elevatedSurface, borderColor: sectionBorder }]}>
              {LIVENESS_GUIDE_STEPS.map((step) => (
                <View key={step.title} style={styles.livenessTimelineRow}>
                  <View style={[styles.livenessTimelineDotActive, { backgroundColor: theme.accent }]} />
                  <Text style={[styles.livenessTimelineText, styles.livenessTimelineTextActive, { color: titleColor }]}>
                    {step.title}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.livenessFooter}>
              <TouchableOpacity
                style={[
                  styles.livenessPrimaryButton,
                  { backgroundColor: theme.tint, shadowColor: theme.tint },
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={openLiveLivenessCamera}
                disabled={loading}
              >
                <Text style={styles.livenessPrimaryButtonText}>
                  Open live camera
                </Text>
              </TouchableOpacity>
              <Text style={[styles.livenessPrepNote, { color: bodyColor }]}>
                Tip: use good lighting and keep your phone at eye level for the fastest review.
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: sectionBorder, backgroundColor: sheetSurface }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={titleColor} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: titleColor }]}>Betweener Verification</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView style={[styles.content, { backgroundColor: theme.background }]}>
          {/* Rejection Status Alert */}
          {verificationStatus.hasRejection && (
            <View style={[styles.rejectionAlert, { backgroundColor: isDark ? '#2a1718' : '#ffebee' }]}>
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
            <View style={[styles.pendingAlert, { backgroundColor: isDark ? '#2a2416' : '#fff3e0' }]}>
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
          <View style={[styles.statusCard, { backgroundColor: elevatedSurface, borderColor: sectionBorder }]}>
            <View style={styles.statusHeader}>
              <Ionicons 
                name={currentBadge.icon as any} 
                size={32} 
                color={currentBadge.color} 
              />
              <View style={styles.statusText}>
                <Text style={[styles.statusLevel, { color: titleColor }]}>{currentBadge.label} Verified</Text>
                <Text style={[styles.statusDescription, { color: bodyColor }]}>
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
            <Text style={[styles.sectionEyebrow, { color: theme.accent }]}>Trust on Betweener</Text>
            <Text style={[styles.sectionTitle, { color: titleColor }]}>Why verify your profile?</Text>
            <Text style={[styles.sectionIntro, { color: bodyColor }]}>
              Verification makes your profile feel more real, lowers hesitation, and gives serious matches
              a stronger reason to engage.
            </Text>
            <View style={styles.benefitsList}>
              <View style={styles.benefit}>
                <Ionicons name="shield-checkmark" size={20} color={theme.tint} />
                <Text style={[styles.benefitText, { color: bodyColor }]}>Build trust with potential matches</Text>
              </View>
              <View style={styles.benefit}>
                <Ionicons name="eye" size={20} color={theme.tint} />
                <Text style={[styles.benefitText, { color: bodyColor }]}>Increase profile visibility</Text>
              </View>
              <View style={styles.benefit}>
                <Ionicons name="heart" size={20} color={theme.tint} />
                <Text style={[styles.benefitText, { color: bodyColor }]}>Connect with verified diaspora members</Text>
              </View>
              <View style={styles.benefit}>
                <Ionicons name="globe" size={20} color={theme.tint} />
                <Text style={[styles.benefitText, { color: bodyColor }]}>Access long-distance matching features</Text>
              </View>
            </View>
          </View>

          {/* Featured verification method */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: titleColor }]}>Start with the fastest option</Text>
            <TouchableOpacity
              style={[
                styles.featuredMethodCard,
                { backgroundColor: heroSurface, borderColor: sectionBorder },
                selectedMethod === featuredMethod.id && [styles.selectedMethod, selectedCardStyle],
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
                    <Text style={[styles.featuredTitle, { color: titleColor }]}>{featuredMethod.title}</Text>
                    <View style={[styles.recommendedBadge, { backgroundColor: softAccentSurface }]}>
                      <Text style={[styles.recommendedBadgeText, { color: theme.accent }]}>Recommended</Text>
                    </View>
                  </View>
                  <Text style={[styles.featuredDescription, { color: bodyColor }]}>{featuredMethod.description}</Text>
                </View>
              </View>

              <View style={styles.featuredMetaRow}>
                <View style={[styles.metaPill, styles.metaPillPrimary, { backgroundColor: softAccentSurface, borderColor: `${theme.accent}35` }]}>
                  <Ionicons name="flash-outline" size={14} color={theme.accent} />
                  <Text style={[styles.metaPillText, styles.metaPillTextPrimary, { color: theme.accent }]}>{featuredMethod.helperLabel}</Text>
                </View>
                <View style={[styles.metaPill, { backgroundColor: elevatedSurface, borderColor: sectionBorder }]}>
                  <Ionicons name="time-outline" size={14} color={bodyColor} />
                  <Text style={[styles.metaPillText, { color: bodyColor }]}>{featuredMethod.reviewLabel}</Text>
                </View>
                <View style={[styles.metaPill, { backgroundColor: elevatedSurface, borderColor: sectionBorder }]}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={bodyColor} />
                  <Text style={[styles.metaPillText, { color: bodyColor }]}>Level {featuredMethod.level}</Text>
                </View>
              </View>

              <View style={[styles.howItWorksCard, { backgroundColor: elevatedSurface, borderColor: sectionBorder }]}>
                <Text style={[styles.howItWorksTitle, { color: theme.accent }]}>How it works</Text>
                <View style={styles.howItWorksSteps}>
                  <View style={styles.howItWorksStep}>
                    <View style={[styles.howItWorksBadge, { backgroundColor: softAccentSurface }]}>
                      <Text style={[styles.howItWorksBadgeText, { color: theme.accent }]}>1</Text>
                    </View>
                    <Text style={[styles.howItWorksStepText, { color: bodyColor }]}>Open the front camera and start recording</Text>
                  </View>
                  <View style={[styles.howItWorksDivider, { backgroundColor: `${theme.accent}35` }]} />
                  <View style={styles.howItWorksStep}>
                    <View style={[styles.howItWorksBadge, { backgroundColor: softAccentSurface }]}>
                      <Text style={[styles.howItWorksBadgeText, { color: theme.accent }]}>2</Text>
                    </View>
                    <Text style={[styles.howItWorksStepText, { color: bodyColor }]}>Turn slightly left and blink during the clip</Text>
                  </View>
                  <View style={[styles.howItWorksDivider, { backgroundColor: `${theme.accent}35` }]} />
                  <View style={styles.howItWorksStep}>
                    <View style={[styles.howItWorksBadge, { backgroundColor: softAccentSurface }]}>
                      <Text style={[styles.howItWorksBadgeText, { color: theme.accent }]}>3</Text>
                    </View>
                    <Text style={[styles.howItWorksStepText, { color: bodyColor }]}>Submit for quick review</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Other verification methods */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: titleColor }]}>Other ways to verify</Text>
            {fastMethods.length > 0 ? (
              <View style={styles.methodGroup}>
                <Text style={[styles.methodGroupTitle, { color: bodyColor }]}>Lightweight trust signals</Text>
                {fastMethods.map((method) => (
                  <TouchableOpacity
                    key={method.id}
                    style={[
                      styles.methodCard,
                      { backgroundColor: elevatedSurface, borderColor: sectionBorder },
                      selectedMethod === method.id && [styles.selectedMethod, selectedCardStyle],
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
                          <Text style={[styles.methodTitle, { color: titleColor }]}>{method.title}</Text>
                          <View style={[styles.reviewBadge, { backgroundColor: isDark ? theme.background : theme.backgroundSubtle }]}>
                            <Text style={[styles.reviewBadgeText, { color: bodyColor }]}>{method.reviewLabel}</Text>
                          </View>
                        </View>
                        <Text style={[styles.methodDescription, { color: bodyColor }]}>{method.description}</Text>
                        <Text style={[styles.methodHelper, { color: bodyColor }]}>{method.helperLabel}</Text>
                      </View>
                      <View style={[styles.levelBadgeMuted, { backgroundColor: softTintSurface, borderColor: `${theme.tint}30` }]}>
                        <Text style={[styles.levelTextMuted, { color: theme.tint }]}>L{method.level}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.methodGroup}>
              <Text style={[styles.methodGroupTitle, { color: bodyColor }]}>Document verification</Text>
              {documentMethods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.methodCard,
                    { backgroundColor: elevatedSurface, borderColor: sectionBorder },
                    selectedMethod === method.id && [styles.selectedMethod, selectedCardStyle],
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
                        <Text style={[styles.methodTitle, { color: titleColor }]}>{method.title}</Text>
                        <View style={[styles.reviewBadge, { backgroundColor: isDark ? theme.background : theme.backgroundSubtle }]}>
                          <Text style={[styles.reviewBadgeText, { color: bodyColor }]}>{method.reviewLabel}</Text>
                        </View>
                      </View>
                      <Text style={[styles.methodDescription, { color: bodyColor }]}>{method.description}</Text>
                      <Text style={[styles.methodHelper, { color: bodyColor }]}>{method.helperLabel}</Text>
                    </View>
                    <View style={[styles.levelBadgeMuted, { backgroundColor: softTintSurface, borderColor: `${theme.tint}30` }]}>
                      <Text style={[styles.levelTextMuted, { color: theme.tint }]}>L{method.level}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Action Button */}
          {selectedMethod && (
            <View style={styles.submitSection}>
              <Text style={[styles.submitHelper, { color: bodyColor }]}>
                {verificationMethods.find((method) => method.id === selectedMethod)?.helperLabel}
              </Text>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: theme.tint },
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
          <View style={[styles.disclaimer, { backgroundColor: elevatedSurface }]}>
            <Ionicons name="information-circle-outline" size={16} color={bodyColor} />
            <Text style={[styles.disclaimerText, { color: bodyColor }]}>
              Your documents are securely stored and only used for verification purposes. 
              Most reviews are completed within 1-2 business days.
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
  livenessScreen: {
    flex: 1,
    backgroundColor: '#fbf3ea',
  },
  livenessScroll: {
    flex: 1,
  },
  livenessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  livenessBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: '#ede0d0',
  },
  livenessHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  livenessContent: {
    paddingHorizontal: 24,
  },
  livenessEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#7C5FE6',
    marginBottom: 8,
  },
  livenessTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#18212f',
  },
  livenessSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#5f6673',
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
    fontSize: 32,
    fontWeight: '800',
    color: '#18212f',
  },
  livenessRingCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f8f8e',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  livenessStepCard: {
    marginTop: 28,
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#ecdcc8',
    shadowColor: '#52321d',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
    color: '#18212f',
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
    color: '#5f6673',
  },
  livenessTimeline: {
    marginTop: 22,
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    gap: 10,
    borderWidth: 1,
    borderColor: '#ecdcc8',
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
    backgroundColor: '#0f8f8e',
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
    color: '#18212f',
  },
  livenessFooter: {
    marginTop: 24,
    paddingTop: 8,
    gap: 12,
  },
  livenessPrepNote: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5f6673',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  livenessPrimaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#0f8f8e',
    shadowColor: '#0f8f8e',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
  liveCameraGradient: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: 'rgba(10,16,24,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  liveCameraBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(10,16,24,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  liveCameraBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  liveCameraStatusWrap: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(15,143,142,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    marginTop: 2,
    marginBottom: 10,
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  liveRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: 8 }],
  },
  liveRingPercent: {
    fontSize: 38,
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
    marginTop: 14,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  livePromptWrap: {
    alignItems: 'center',
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
    gap: 10,
  },
  liveFooterDock: {
    minWidth: 286,
    maxWidth: 338,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 30,
    backgroundColor: 'rgba(10,16,24,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  liveChecklistRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  liveChecklistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  liveChecklistPillCompleted: {
    backgroundColor: 'rgba(15,143,142,0.46)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  liveChecklistText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  liveRecordButton: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
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
    letterSpacing: 0.2,
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
