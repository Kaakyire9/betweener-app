export type FirstPartyExpressionMotion =
  | 'heartbeat_once'
  | 'intertwine_once'
  | 'spark_once'
  | 'orbit_once'
  | 'light_travel_once'
  | 'hug_once'
  | 'settle_once'
  | 'twinkle_once';

export type FirstPartyExpressionAsset = {
  id: string;
  label: string;
  accessibilityLabel: string;
  associatedEmoji: string | null;
  assetVersion: number;
  width: number;
  height: number;
  animatedAsset: string | null;
  staticFallbackAsset: string | null;
  motion: FirstPartyExpressionMotion;
};

export type FirstPartyExpressionPackManifest = {
  schemaVersion: 1;
  id: 'between-us';
  label: 'Between Us';
  version: 1;
  source: 'betweener_first_party';
  releaseStatus: 'assets_required';
  productionVisible: false;
  assets: readonly FirstPartyExpressionAsset[];
};

/**
 * Versioned contract for commissioned Betweener artwork. All asset references
 * intentionally remain null until provenance-reviewed files are supplied.
 */
export const BETWEEN_US_PACK: FirstPartyExpressionPackManifest = {
  schemaVersion: 1,
  id: 'between-us',
  label: 'Between Us',
  version: 1,
  source: 'betweener_first_party',
  releaseStatus: 'assets_required',
  productionVisible: false,
  assets: [
    { id: 'love', label: 'Love', accessibilityLabel: 'Love heart', associatedEmoji: '❤️', assetVersion: 1, width: 512, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'heartbeat_once' },
    { id: 'great-flow', label: 'Great Flow', accessibilityLabel: 'Two ribbons in a great flow', associatedEmoji: '💚', assetVersion: 1, width: 512, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'intertwine_once' },
    { id: 'warm-spark', label: 'Warm Spark', accessibilityLabel: 'Two forms meeting at a warm spark', associatedEmoji: '✨', assetVersion: 1, width: 512, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'spark_once' },
    { id: 'thinking-of-you', label: 'Thinking of You', accessibilityLabel: 'A heart moving through an open orbit', associatedEmoji: '💭', assetVersion: 1, width: 512, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'orbit_once' },
    { id: 'across-the-miles', label: 'Across the Miles', accessibilityLabel: 'Two distant points connected across the miles', associatedEmoji: null, assetVersion: 1, width: 640, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'light_travel_once' },
    { id: 'a-hug', label: 'A Hug', accessibilityLabel: 'Two soft forms embracing', associatedEmoji: '🫂', assetVersion: 1, width: 512, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'hug_once' },
    { id: 'you-and-me', label: 'You & Me', accessibilityLabel: 'Two complementary forms fitting together', associatedEmoji: null, assetVersion: 1, width: 512, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'settle_once' },
    { id: 'goodnight', label: 'Goodnight', accessibilityLabel: 'A crescent moon cradling a lavender heart', associatedEmoji: '🌙', assetVersion: 1, width: 512, height: 512, animatedAsset: null, staticFallbackAsset: null, motion: 'twinkle_once' },
  ],
} as const;

export const getProductionBetweenUsAssets = () => (
  BETWEEN_US_PACK.productionVisible
    ? BETWEEN_US_PACK.assets.filter((asset) => asset.animatedAsset && asset.staticFallbackAsset)
    : []
);
