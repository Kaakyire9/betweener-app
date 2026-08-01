import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Upload, type PreviousUpload, type UrlStorage } from 'tus-js-client';

import {
  buildChatUploadFingerprint,
  CHAT_RESUMABLE_UPLOAD_CHUNK_BYTES,
  createDirectStorageOrigin,
  isFreshChatUploadCheckpoint,
} from '@/lib/chat/transfer/chat-upload-policy';

const TUS_URL_STORAGE_KEY = 'chat:tus-upload-urls:v1';
const TUS_RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000, 20_000];

type StoredUploadEntry = PreviousUpload & {
  fingerprint: string;
  ownerUserId?: string;
};

type StoredUploadMap = Record<string, StoredUploadEntry>;

export type ChatUploadProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  fraction: number;
};

export type ChatUploadRequest = {
  bucket: string;
  objectPath: string;
  localUri: string;
  fileName: string;
  contentType: string;
  byteSize?: number | null;
  accessToken: string;
  anonKey: string;
  supabaseUrl: string;
  ownerUserId?: string;
  upsert?: boolean;
  onProgress?: (progress: ChatUploadProgress) => void;
};

export type ChatUploadResult = {
  objectPath: string;
  transport: 'tus';
  resumed: boolean;
};

const activeUploads = new Map<string, Upload>();
const activeUploadPromises = new Map<string, Promise<ChatUploadResult>>();
let storageMutation: Promise<void> = Promise.resolve();

const queueStorageMutation = <T>(operation: () => Promise<T>): Promise<T> => {
  const queued = storageMutation.then(operation, operation);
  storageMutation = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
};

const readStoredUploads = async (): Promise<StoredUploadMap> => {
  try {
    const raw = await AsyncStorage.getItem(TUS_URL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as StoredUploadMap).filter(([, entry]) =>
        isFreshChatUploadCheckpoint(entry.creationTime)),
    );
  } catch {
    return {};
  }
};

const writeStoredUploads = async (entries: StoredUploadMap) => {
  await AsyncStorage.setItem(TUS_URL_STORAGE_KEY, JSON.stringify(entries));
};

class ChatTusUrlStorage implements UrlStorage {
  constructor(private readonly ownerUserId?: string) {}
  async findAllUploads(): Promise<PreviousUpload[]> {
    const entries = await readStoredUploads();
    return Object.values(entries);
  }

  async findUploadsByFingerprint(fingerprint: string): Promise<PreviousUpload[]> {
    const entries = await readStoredUploads();
    return Object.values(entries).filter((entry) => entry.fingerprint === fingerprint);
  }

  async removeUpload(urlStorageKey: string): Promise<void> {
    await queueStorageMutation(async () => {
      const entries = await readStoredUploads();
      if (!entries[urlStorageKey]) return;
      delete entries[urlStorageKey];
      await writeStoredUploads(entries);
    });
  }

  async addUpload(fingerprint: string, upload: PreviousUpload): Promise<string> {
    const urlStorageKey = `chat-tus:${fingerprint}`;
    await queueStorageMutation(async () => {
      const entries = await readStoredUploads();
      entries[urlStorageKey] = {
        ...upload,
        fingerprint,
        urlStorageKey,
        ownerUserId: this.ownerUserId,
      };
      await writeStoredUploads(entries);
    });
    return urlStorageKey;
  }

  async clearForOwner(ownerUserId: string): Promise<void> {
    await queueStorageMutation(async () => {
      const entries = await readStoredUploads();
      const retained = Object.fromEntries(Object.entries(entries).filter(([, entry]) =>
        entry.ownerUserId !== ownerUserId &&
        !entry.fingerprint.includes(`:${ownerUserId}/`),
      ));
      await writeStoredUploads(retained);
    });
  }
}

const tusUrlStorage = new ChatTusUrlStorage();

const resolveByteSize = async (request: ChatUploadRequest) => {
  if (
    typeof request.byteSize === 'number' &&
    Number.isFinite(request.byteSize) &&
    request.byteSize > 0
  ) {
    return Math.round(request.byteSize);
  }
  const info = await FileSystem.getInfoAsync(request.localUri);
  return info.exists && 'size' in info && typeof info.size === 'number' ? info.size : null;
};

const uploadTus = async (
  request: ChatUploadRequest,
  byteSize: number,
): Promise<ChatUploadResult> => {
  const directOrigin = createDirectStorageOrigin(request.supabaseUrl);
  const fingerprint = buildChatUploadFingerprint({
    bucket: request.bucket,
    objectPath: request.objectPath,
    byteSize,
    contentType: request.contentType,
  });
  let resumed = false;
  const upsert = request.upsert ?? true;
  const existingPromise = activeUploadPromises.get(fingerprint);
  if (existingPromise) return existingPromise;
  const requestUrlStorage = new ChatTusUrlStorage(
    request.ownerUserId ?? request.objectPath.split('/')[0],
  );

  const operation = new Promise<ChatUploadResult>((resolve, reject) => {
    const upload = new Upload(
      {
        uri: request.localUri,
        name: request.fileName,
        type: request.contentType,
      } as unknown as File,
      {
        endpoint: `${directOrigin}/storage/v1/upload/resumable`,
        chunkSize: CHAT_RESUMABLE_UPLOAD_CHUNK_BYTES,
        retryDelays: TUS_RETRY_DELAYS_MS,
        uploadSize: byteSize,
        headers: {
          authorization: `Bearer ${request.accessToken}`,
          apikey: request.anonKey,
          ...(upsert ? { 'x-upsert': 'true' } : {}),
        },
        metadata: {
          bucketName: request.bucket,
          objectName: request.objectPath,
          contentType: request.contentType,
          cacheControl: '3600',
        },
        fingerprint: async () => fingerprint,
        urlStorage: requestUrlStorage,
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,
        uploadDataDuringCreation: false,
        onProgress: (bytesUploaded, bytesTotal) => {
          request.onProgress?.({
            bytesUploaded,
            bytesTotal,
            fraction: bytesTotal > 0 ? Math.min(1, bytesUploaded / bytesTotal) : 0,
          });
        },
        onError: (error) => {
          activeUploads.delete(fingerprint);
          reject(error);
        },
        onSuccess: () => {
          activeUploads.delete(fingerprint);
          resolve({ objectPath: request.objectPath, transport: 'tus', resumed });
        },
      },
    );

    activeUploads.set(fingerprint, upload);
    void upload.findPreviousUploads()
      .then((previousUploads) => {
        const previous = previousUploads[0];
        if (previous) {
          resumed = true;
          upload.resumeFromPreviousUpload(previous);
        }
        upload.start();
      })
      .catch((error) => {
        activeUploads.delete(fingerprint);
        reject(error);
      });
  });
  activeUploadPromises.set(fingerprint, operation);
  return operation.finally(() => {
    activeUploadPromises.delete(fingerprint);
  });
};

export const ChatUploadTransport = {
  async upload(request: ChatUploadRequest): Promise<ChatUploadResult> {
    const byteSize = await resolveByteSize(request);
    if (byteSize == null || byteSize <= 0) {
      throw new Error('chat_upload_source_unavailable');
    }
    // Expo FileSystem's legacy background uploader can raise an uncaught
    // NSURLSession Objective-C exception on iOS. Keep every attachment on the
    // same resumable transport so failures remain recoverable in JavaScript.
    return uploadTus(request, byteSize);
  },

  async cancel(request: Pick<ChatUploadRequest, 'bucket' | 'objectPath' | 'byteSize' | 'contentType'>) {
    const size = Number(request.byteSize ?? 0);
    const fingerprint = buildChatUploadFingerprint({
      bucket: request.bucket,
      objectPath: request.objectPath,
      byteSize: size,
      contentType: request.contentType,
    });
    const direct = activeUploads.get(fingerprint);
    const fallbackEntry = !direct
      ? [...activeUploads.entries()].find(([key]) =>
          key.includes(`:${request.bucket}:${request.objectPath}:`),
        )
      : null;
    const upload = direct ?? fallbackEntry?.[1];
    if (!upload) return false;
    await upload.abort(false);
    activeUploads.delete(fingerprint);
    if (fallbackEntry) activeUploads.delete(fallbackEntry[0]);
    return true;
  },

  async clearForOwner(ownerUserId: string) {
    if (!ownerUserId) return;
    const matching = [...activeUploads.entries()].filter(([fingerprint]) =>
      fingerprint.includes(`:${ownerUserId}/`),
    );
    await Promise.all(matching.map(async ([fingerprint, upload]) => {
      await upload.abort(true).catch(() => undefined);
      activeUploads.delete(fingerprint);
      activeUploadPromises.delete(fingerprint);
    }));
    await tusUrlStorage.clearForOwner(ownerUserId);
  },
};
