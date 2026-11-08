import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedRelationshipGist = {
  gist_id: string;
  edition_id: string | null;
  revision_id: string | null;
  title: string;
  short_body: string | null;
  body: string | null;
  selected_perspective: string;
  availability: 'available' | 'unavailable';
  unavailable_reason: string | null;
  progress: number;
  last_read_at: string | null;
  last_opened_at: string | null;
  last_anchor: string | null;
  last_anchor_offset: number | null;
  read_acknowledged_at: string | null;
  saved_at: string;
};

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>;
};

const SAVED_LIBRARY_KEY_PREFIX = 'relationship-gist-saved-library:v1:';

const getSavedLibraryCacheKey = (
  ownerUserId: string,
  perspective: string | null,
) => `${SAVED_LIBRARY_KEY_PREFIX}${ownerUserId}:${perspective ?? 'all'}`;

export const readSavedRelationshipGistCache = async (
  ownerUserId: string,
  perspective: string | null,
): Promise<SavedRelationshipGist[]> => {
  try {
    const raw = await AsyncStorage.getItem(getSavedLibraryCacheKey(ownerUserId, perspective));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeSavedRelationshipGistCache = async (
  ownerUserId: string,
  perspective: string | null,
  items: SavedRelationshipGist[],
) => AsyncStorage.setItem(
  getSavedLibraryCacheKey(ownerUserId, perspective),
  JSON.stringify(items),
);

export async function fetchSavedRelationshipGists(
  client: RpcClient,
  perspective: string | null,
): Promise<SavedRelationshipGist[]> {
  const { data, error } = await client.rpc('rpc_get_my_saved_relationship_gists', {
    p_perspective: perspective,
  });
  if (error) throw error;
  return (data ?? []) as SavedRelationshipGist[];
}
