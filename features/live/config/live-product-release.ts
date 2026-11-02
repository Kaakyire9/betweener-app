import { APP_VARIANT } from '@/config/app-identity';

const configured = process.env.EXPO_PUBLIC_LIVE_PRODUCT_ENABLED;

/**
 * Live remains a staging-only product until a reviewed production release
 * explicitly removes this variant fence. An explicit false also provides a
 * local/staging kill switch.
 */
export const LIVE_PRODUCT_ENABLED = APP_VARIANT === 'staging' && configured !== 'false';

export const LIVE_PRODUCT_UNAVAILABLE_COPY = Object.freeze({
  eyebrow: 'BETWEENER LIVE',
  title: 'Live is coming soon',
  body: 'We are finishing the broadcast experience. Everything else in Betweener is ready for you.',
});
