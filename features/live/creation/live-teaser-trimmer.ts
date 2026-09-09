import * as FileSystem from 'expo-file-system/legacy';
import type { ImagePickerAsset } from 'expo-image-picker';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { Spec as VideoTrimSpec } from 'react-native-video-trim';
import { LIVE_EVENT_TEASER_MAX_DURATION_MS } from '@/features/live/application/live-event-media.ts';

export const LIVE_TEASER_MIN_DURATION_MS = 1_000;

type TrimFinishedEvent = {
  outputPath: string;
  startTime: number;
  endTime: number;
  duration: number;
};

type TrimErrorEvent = {
  message: string;
  errorCode: string;
};

type LegacyTrimEvent = Partial<TrimFinishedEvent & TrimErrorEvent> & {
  name?: string;
};

type RemovableSubscription = {
  remove: () => void;
};

const asFileUri = (path: string) => /^[a-z][a-z\d+.-]*:\/\//i.test(path) ? path : `file://${path}`;

const toTrimmedAsset = async (
  source: ImagePickerAsset,
  event: TrimFinishedEvent,
): Promise<ImagePickerAsset> => {
  const uri = asFileUri(event.outputPath);
  const info = await FileSystem.getInfoAsync(uri);
  return {
    ...source,
    uri,
    assetId: null,
    type: 'video',
    fileName: `live-preview-${Date.now()}.mp4`,
    fileSize: info.exists && 'size' in info ? info.size : undefined,
    mimeType: 'video/mp4',
    duration: Math.min(
      LIVE_EVENT_TEASER_MAX_DURATION_MS,
      Math.max(0, event.duration || event.endTime - event.startTime),
    ),
  };
};

const isTrimFinishedEvent = (event: LegacyTrimEvent): event is LegacyTrimEvent & TrimFinishedEvent => (
  typeof event.outputPath === 'string'
  && typeof event.startTime === 'number'
  && typeof event.endTime === 'number'
  && typeof event.duration === 'number'
);

/**
 * Opens the native editor and resolves with a new local asset. The dependency is
 * loaded on demand so an older 1.1.1 binary without the native module can still
 * launch and use the rest of Live Studio safely.
 */
export const trimLiveTeaser = async (
  source: ImagePickerAsset,
): Promise<ImagePickerAsset | null> => {
  if (Platform.OS === 'web') throw new Error('live_teaser_trimmer_unavailable');

  const videoTrim = await import('react-native-video-trim');
  const nativeModule = videoTrim.default as VideoTrimSpec;

  return new Promise<ImagePickerAsset | null>((resolve, reject) => {
    const subscriptions: RemovableSubscription[] = [];
    let settled = false;

    const cleanup = () => {
      subscriptions.splice(0).forEach((subscription) => subscription.remove());
    };
    const finish = (value: ImagePickerAsset | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message || 'live_teaser_trim_failed'));
    };
    const onFinished = (event: TrimFinishedEvent) => {
      void toTrimmedAsset(source, event).then(finish).catch(() => fail('live_teaser_trim_failed'));
    };
    const onError = (event: TrimErrorEvent) => fail(event.message || event.errorCode);

    try {
      if (typeof nativeModule.onFinishTrimming === 'function') {
        subscriptions.push(nativeModule.onFinishTrimming(onFinished));
        subscriptions.push(nativeModule.onError(onError));
        subscriptions.push(nativeModule.onCancel(() => finish(null)));
      } else {
        const emitter = new NativeEventEmitter(NativeModules.VideoTrim);
        subscriptions.push(emitter.addListener('VideoTrim', (event: LegacyTrimEvent) => {
          if (event.name === 'onFinishTrimming' && isTrimFinishedEvent(event)) onFinished(event);
          if (event.name === 'onError') fail(event.message || event.errorCode || 'live_teaser_trim_failed');
          if (event.name === 'onCancel') finish(null);
        }));
      }

      videoTrim.showEditor(source.uri, {
        type: 'video',
        outputExt: 'mp4',
        maxDuration: LIVE_EVENT_TEASER_MAX_DURATION_MS,
        minDuration: LIVE_TEASER_MIN_DURATION_MS,
        enablePreciseTrimming: true,
        enableEditTools: false,
        saveToPhoto: false,
        fullScreenModalIOS: true,
        autoplay: true,
        closeWhenFinish: true,
        headerText: 'Choose up to 20 seconds',
        saveButtonText: 'Use clip',
        cancelButtonText: 'Cancel',
        enableSaveDialog: false,
        trimmingText: 'Preparing your Live preview...',
        durationFormat: 'mm:ss',
        theme: 'dark',
        trimmerColor: '#7D5BA6',
        handleIconColor: '#102522',
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : 'live_teaser_trimmer_unavailable');
    }
  });
};
