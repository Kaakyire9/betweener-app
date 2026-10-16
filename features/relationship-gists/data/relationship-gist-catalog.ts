import {
  readRelationshipGistContentCache,
  writeRelationshipGistContentCache,
} from '@/features/relationship-gists/data/relationship-gist-content-cache';
import {
  fetchCurrentRelationshipGists,
  type RelationshipGistDataClient,
} from '@/features/relationship-gists/data/relationship-gist-repository';
import type { RelationshipGist } from '@/features/relationship-gists/domain/relationship-gist';
import { readSavedRelationshipGistCache } from '@/features/relationship-gists/data/relationship-gist-saved-repository';

export type RelationshipGistCatalogResult = {
  items: RelationshipGist[];
  source: 'network' | 'cache';
  savedAt: number | null;
  networkError: unknown | null;
};

const readOfflineCatalog = async (ownerUserId: string) => {
  const cached = await readRelationshipGistContentCache(ownerUserId);
  if (cached.items.length) return cached;
  const saved = await readSavedRelationshipGistCache(ownerUserId, null);
  const items = saved
    .filter((item) => item.availability === 'available' && Boolean(item.body))
    .map<RelationshipGist>((item) => ({
      id: item.gist_id,
      title: item.title,
      short_body: item.short_body,
      body: item.body ?? '',
      perspective: item.selected_perspective,
      circle_id: null,
    }));
  if (items.length) {
    await writeRelationshipGistContentCache(ownerUserId, items).catch(() => undefined);
  }
  return { items, savedAt: items.length ? Date.now() : null };
};

export async function loadRelationshipGistCatalog(
  client: RelationshipGistDataClient,
  ownerUserId: string,
  options: { networkAllowed?: boolean } = {},
): Promise<RelationshipGistCatalogResult> {
  const networkAllowed = options.networkAllowed !== false;
  if (networkAllowed) {
    try {
      const result = await fetchCurrentRelationshipGists(client);
      const items = result.data.filter((item) => !item.circle_id);
      await writeRelationshipGistContentCache(ownerUserId, items).catch(() => undefined);
      return {
        items,
        source: 'network',
        savedAt: Date.now(),
        networkError: result.primaryError,
      };
    } catch (networkError) {
      const cached = await readOfflineCatalog(ownerUserId);
      if (cached.items.length) {
        return { ...cached, source: 'cache', networkError };
      }
      throw networkError;
    }
  }

  const cached = await readOfflineCatalog(ownerUserId);
  return { ...cached, source: 'cache', networkError: null };
}
