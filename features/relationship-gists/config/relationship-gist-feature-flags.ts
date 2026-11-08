const READER_V2_FLAG = process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_READER_V2_ENABLED;
const ENGAGEMENT_FLAG = process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_ENGAGEMENT_ENABLED;
const REACTIONS_FLAG = process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_REACTIONS_ENABLED;
const REFLECTIONS_FLAG = process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_REFLECTIONS_ENABLED;
const ANALYTICS_FLAG = process.env.EXPO_PUBLIC_RELATIONSHIP_GIST_ANALYTICS_ENABLED;

// Fail closed until the additive v2 state migration is explicitly applied in an
// authorized environment. Disabled mode never drains into either the v1 or v2 RPC.
export const RELATIONSHIP_GIST_READER_V2_ENABLED = READER_V2_FLAG === 'true';

// Every Milestone 4 surface is independently fail-closed. The master switch is
// required as well as the capability switch, so a partially configured build
// cannot expose a write path accidentally.
export const RELATIONSHIP_GIST_ENGAGEMENT_ENABLED = ENGAGEMENT_FLAG === 'true';
export const RELATIONSHIP_GIST_REACTIONS_ENABLED =
  RELATIONSHIP_GIST_ENGAGEMENT_ENABLED && REACTIONS_FLAG === 'true';
export const RELATIONSHIP_GIST_REFLECTIONS_ENABLED =
  RELATIONSHIP_GIST_ENGAGEMENT_ENABLED && REFLECTIONS_FLAG === 'true';
export const RELATIONSHIP_GIST_ANALYTICS_ENABLED =
  RELATIONSHIP_GIST_ENGAGEMENT_ENABLED && ANALYTICS_FLAG === 'true';
