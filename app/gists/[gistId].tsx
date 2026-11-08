import { RelationshipGistStandaloneReader } from '@/features/relationship-gists/components/RelationshipGistStandaloneReader';
import type { RelationshipGistEngagementSource } from '@/features/relationship-gists/engagement/relationship-gist-engagement';
import { useLocalSearchParams } from 'expo-router';

const normalizeSource = (value: string | string[] | undefined): RelationshipGistEngagementSource => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'saved_library' ? 'saved_library' : 'canonical_reader';
};

export default function RelationshipGistRoute() {
  const params = useLocalSearchParams<{
    gistId?: string | string[];
    perspective?: string | string[];
    source?: string | string[];
  }>();
  const gistId = Array.isArray(params.gistId) ? params.gistId[0] : params.gistId;
  const perspective = Array.isArray(params.perspective) ? params.perspective[0] : params.perspective;

  return (
    <RelationshipGistStandaloneReader
      gistId={String(gistId ?? '').trim()}
      initialPerspective={perspective}
      source={normalizeSource(params.source)}
    />
  );
}
