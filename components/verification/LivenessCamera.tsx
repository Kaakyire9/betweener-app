import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleProp, useWindowDimensions, ViewStyle } from 'react-native';
import {
  Camera,
  type Recorder,
  useCameraPermission,
  useVideoOutput,
} from 'react-native-vision-camera';
import {
  createFaceDetectorOutput,
  type Face,
} from 'react-native-vision-camera-face-detector';

import type { FaceObservation } from '@/lib/verification/liveness-engine';

const MAX_LIVENESS_FILE_BYTES = 15 * 1024 * 1024;
// A natural blink is often only 100–150 ms. Sampling near 16 fps lets the
// server-required two-frame blink proof remain achievable without asking the
// user to hold their eyes closed, while still throttling ML callbacks.
const FACE_CALLBACK_INTERVAL_MS = 60;

export type LivenessRecording = {
  uri: string;
  mimeType: 'video/mp4' | 'video/quicktime';
  fileName: string;
};

export type LivenessCameraHandle = {
  startRecording: (maxDurationSeconds: number) => Promise<LivenessRecording>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
};

type LivenessCameraProps = {
  active: boolean;
  style?: StyleProp<ViewStyle>;
  onReady: () => void;
  onError: (error: Error) => void;
  onFaceObservation: (observation: FaceObservation) => void;
};

export function useLivenessCameraPermission() {
  return useCameraPermission();
}

function toRecording(filePath: string): LivenessRecording {
  const normalizedPath = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  const extension = filePath.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  const isQuickTime = extension === 'mov';

  return {
    uri: normalizedPath,
    mimeType: isQuickTime ? 'video/quicktime' : 'video/mp4',
    fileName: `selfie_liveness_${Date.now()}.${isQuickTime ? 'mov' : 'mp4'}`,
  };
}

export const LivenessCamera = forwardRef<LivenessCameraHandle, LivenessCameraProps>(
  function LivenessCamera({ active, style, onReady, onError, onFaceObservation }, ref) {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const videoOutput = useVideoOutput({
      enableAudio: false,
      fileType: 'mp4',
      targetBitRate: 1_800_000,
    });
    const recorderRef = useRef<Recorder | null>(null);
    const recordingPromiseRef = useRef<Promise<LivenessRecording> | null>(null);
    const observationCallbackRef = useRef(onFaceObservation);
    const errorCallbackRef = useRef(onError);
    const lastObservationAtRef = useRef(0);
    observationCallbackRef.current = onFaceObservation;
    errorCallbackRef.current = onError;

    const faceDetectorOutput = useMemo(
      () => createFaceDetectorOutput({
        cameraFacing: 'front',
        autoMode: true,
        windowWidth,
        windowHeight,
        performanceMode: 'fast',
        runClassifications: true,
        runContours: false,
        runLandmarks: true,
        minFaceSize: 0.2,
        trackingEnabled: true,
        outputResolution: 'preview',
        onFacesDetected: (faces: Face[]) => {
          const capturedAt = Date.now();
          if (capturedAt - lastObservationAtRef.current < FACE_CALLBACK_INTERVAL_MS) return;
          lastObservationAtRef.current = capturedAt;

          const face = faces.length === 1 ? faces[0] : null;
          if (!face) {
            observationCallbackRef.current({
              capturedAt,
              faceCount: faces.length,
              centered: false,
              faceWidthRatio: 0,
              yawAngle: 0,
              turnSignal: null,
              leftEyeOpenProbability: null,
              rightEyeOpenProbability: null,
            });
            return;
          }

          const faceWidthRatio = face.bounds.width / Math.max(1, windowWidth);
          const centerX = (face.bounds.x + face.bounds.width / 2) / Math.max(1, windowWidth);
          const centerY = (face.bounds.y + face.bounds.height / 2) / Math.max(1, windowHeight);
          const centered =
            faceWidthRatio >= 0.22 &&
            faceWidthRatio <= 0.72 &&
            Math.abs(centerX - 0.5) <= 0.2 &&
            Math.abs(centerY - 0.46) <= 0.25;
          const leftEye = face.landmarks?.LEFT_EYE;
          const rightEye = face.landmarks?.RIGHT_EYE;
          const nose = face.landmarks?.NOSE_BASE;
          const eyeSpan = leftEye && rightEye ? Math.abs(rightEye.x - leftEye.x) : 0;
          const turnSignal = leftEye && rightEye && nose && eyeSpan >= 4
            ? (nose.x - ((leftEye.x + rightEye.x) / 2)) / eyeSpan
            : null;

          observationCallbackRef.current({
            capturedAt,
            faceCount: 1,
            centered,
            faceWidthRatio,
            yawAngle: Number.isFinite(face.yawAngle) ? face.yawAngle : 0,
            turnSignal: turnSignal !== null && Number.isFinite(turnSignal) ? turnSignal : null,
            leftEyeOpenProbability: face.leftEyeOpenProbability ?? null,
            rightEyeOpenProbability: face.rightEyeOpenProbability ?? null,
          });
        },
        onError: (error: Error) => errorCallbackRef.current(error),
      }),
      [windowHeight, windowWidth],
    );

    const startRecording = useCallback(
      (maxDurationSeconds: number): Promise<LivenessRecording> => {
        if (recordingPromiseRef.current) {
          return recordingPromiseRef.current;
        }

        const recordingPromise = (async () => {
          const recorder = await videoOutput.createRecorder({
            maxDuration: Math.max(1, Math.ceil(maxDurationSeconds)),
            maxFileSize: MAX_LIVENESS_FILE_BYTES,
          });
          recorderRef.current = recorder;

          return new Promise<LivenessRecording>((resolve, reject) => {
            void recorder
              .startRecording(
                (filePath) => resolve(toRecording(filePath)),
                (error) => reject(error),
              )
              .catch(reject);
          });
        })().finally(() => {
          if (recordingPromiseRef.current === recordingPromise) {
            recorderRef.current = null;
            recordingPromiseRef.current = null;
          }
        });

        recordingPromiseRef.current = recordingPromise;
        return recordingPromise;
      },
      [videoOutput],
    );

    const stopRecording = useCallback(async () => {
      const recorder = recorderRef.current;
      if (!recorder?.isRecording) return;
      await recorder.stopRecording();
    }, []);

    const cancelRecording = useCallback(async () => {
      const recorder = recorderRef.current;
      if (!recorder?.isRecording) return;
      await recorder.cancelRecording();
    }, []);

    useEffect(() => {
      return () => {
        const recorder = recorderRef.current;
        if (recorder?.isRecording) {
          void recorder.cancelRecording().catch(() => undefined);
        }
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({ startRecording, stopRecording, cancelRecording }),
      [cancelRecording, startRecording, stopRecording],
    );

    return (
      <Camera
        style={style}
        device="front"
        outputs={[faceDetectorOutput, videoOutput]}
        isActive={active}
        mirrorMode="on"
        resizeMode="cover"
        onPreviewStarted={onReady}
        onError={onError}
      />
    );
  },
);
