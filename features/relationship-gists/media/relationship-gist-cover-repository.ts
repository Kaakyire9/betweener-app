export type RelationshipGistCover = {
  id: string;
  revisionId: string;
  perspective: string;
  storagePath: string;
  altText: string;
  width: number;
  height: number;
  sha256: string;
};

type CoverClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
  storage: { from: (bucket: string) => { createSignedUrl: (path: string, seconds: number) => PromiseLike<{ data: any; error: any }> } };
};

export async function fetchRelationshipGistCover(
  client: CoverClient,
  gistId: string,
  perspective: string,
) {
  const { data, error } = await client.rpc('rpc_get_relationship_gist_cover', {
    p_gist_id: gistId,
    p_perspective: perspective,
  });
  if (error) throw error;
  if (!data?.id || !data?.storage_path) return null;
  const cover: RelationshipGistCover = {
    id: String(data.id),
    revisionId: String(data.revision_id),
    perspective: String(data.perspective),
    storagePath: String(data.storage_path),
    altText: String(data.alt_text),
    width: Number(data.width) || 1536,
    height: Number(data.height) || 1024,
    sha256: String(data.sha256),
  };
  const signed = await client.storage.from('relationship-gist-covers').createSignedUrl(cover.storagePath, 10 * 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error('gist_cover_signing_failed');
  return { cover, signedUrl: String(signed.data.signedUrl) };
}
