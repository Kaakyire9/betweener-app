import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchSavedRelationshipGists,
  readSavedRelationshipGistCache,
  writeSavedRelationshipGistCache,
  type SavedRelationshipGist,
} from '@/features/relationship-gists/data/relationship-gist-saved-repository';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const item = (gistId: string): SavedRelationshipGist => ({
  gist_id: gistId,
  edition_id: 'edition',
  revision_id: 'revision',
  title: 'Saved guidance',
  short_body: 'Short',
  body: 'Long-form saved guidance.',
  selected_perspective: 'general',
  availability: 'available',
  unavailable_reason: null,
  progress: 0.45,
  last_read_at: null,
  last_opened_at: null,
  last_anchor: 'section-1',
  last_anchor_offset: 20,
  read_acknowledged_at: null,
  saved_at: new Date(0).toISOString(),
});

describe('Relationship Gist Saved Library', () => {
  beforeEach(() => jest.clearAllMocks());

  it('isolates durable caches by account and explicit perspective', async () => {
    await writeSavedRelationshipGistCache('user-a', 'christian', [item('gist-a')]);
    await writeSavedRelationshipGistCache('user-b', 'christian', [item('gist-b')]);
    await writeSavedRelationshipGistCache('user-a', 'general', [item('gist-c')]);

    expect(AsyncStorage.setItem).toHaveBeenNthCalledWith(
      1,
      'relationship-gist-saved-library:v1:user-a:christian',
      expect.any(String),
    );
    expect(AsyncStorage.setItem).toHaveBeenNthCalledWith(
      2,
      'relationship-gist-saved-library:v1:user-b:christian',
      expect.any(String),
    );
    expect(AsyncStorage.setItem).toHaveBeenNthCalledWith(
      3,
      'relationship-gist-saved-library:v1:user-a:general',
      expect.any(String),
    );
  });

  it('returns an empty safe fallback for corrupt cached content', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{not-json');
    await expect(readSavedRelationshipGistCache('user-a', null)).resolves.toEqual([]);
  });

  it('passes only the user-selected perspective to the server-authoritative library RPC', async () => {
    const rpc = jest.fn(async (_name: string, _args?: Record<string, unknown>) => ({
      data: [item('gist-a')],
      error: null,
    }));
    const result = await fetchSavedRelationshipGists({ rpc }, 'safety');

    expect(rpc).toHaveBeenCalledWith('rpc_get_my_saved_relationship_gists', {
      p_perspective: 'safety',
    });
    expect(result[0]).toMatchObject({ gist_id: 'gist-a', progress: 0.45 });
  });
});
