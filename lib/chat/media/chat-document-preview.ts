import * as FileSystem from 'expo-file-system/legacy';

const PREVIEW_ROOT = `${FileSystem.cacheDirectory ?? ''}chat-document-previews/`;

const isLocalDocumentUri = (uri: string) =>
  uri.startsWith('file://') || uri.startsWith('content://');

const safeExtension = (fileName: string) => {
  const extension = fileName.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'bin';
};

export type PreparedChatDocumentPreview = {
  uri: string;
  readAccessRoot?: string;
  cleanup: () => Promise<void>;
};

/**
 * Gives WebView access to one isolated local document instead of the shared
 * attachment cache directory. The preview copy is disposable and excluded
 * from device backups because it lives under the cache directory.
 */
export const prepareChatDocumentPreview = async ({
  sourceUri,
  fileName,
}: {
  sourceUri: string;
  fileName: string;
}): Promise<PreparedChatDocumentPreview> => {
  if (!isLocalDocumentUri(sourceUri) || !PREVIEW_ROOT) {
    return { uri: sourceUri, cleanup: async () => {} };
  }

  const previewId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const directory = `${PREVIEW_ROOT}${previewId}/`;
  const destination = `${directory}document.${safeExtension(fileName)}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
  } catch (error) {
    await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {});
    throw error;
  }

  return {
    uri: destination,
    readAccessRoot: directory,
    cleanup: () => FileSystem.deleteAsync(directory, { idempotent: true }),
  };
};
