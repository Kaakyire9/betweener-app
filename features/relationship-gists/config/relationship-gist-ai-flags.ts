export const RELATIONSHIP_GIST_AI_STUDIO_ENABLED =
  process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_AI_STUDIO_ENABLED === 'true';

export const RELATIONSHIP_GIST_AI_IMAGES_ENABLED =
  process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_AI_IMAGES_ENABLED === 'true';

// Approved covers are a reader capability, independent from whether editors
// may generate new imagery with AI. The legacy AI flag remains a compatibility
// fallback for existing staging builds.
const relationshipGistCoversFlag = process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_COVERS_ENABLED;

export const RELATIONSHIP_GIST_COVERS_ENABLED = relationshipGistCoversFlag == null
  ? RELATIONSHIP_GIST_AI_IMAGES_ENABLED
  : relationshipGistCoversFlag === 'true';
