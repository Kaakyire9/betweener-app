import { buildAppUrl } from '@/config/app-identity';
import { APP_SHARE_STORE_LINKS } from '@/config/app-store-links';

export const BETWEENER_IOS_STORE_URL =
  APP_SHARE_STORE_LINKS.ios;

export const BETWEENER_ANDROID_STORE_URL =
  APP_SHARE_STORE_LINKS.android;

type CircleExternalInvite = {
  title: string;
  message: string;
  appUrl: string;
};

const normalizeCircleName = (circleName: string) =>
  circleName.trim() || 'this Circle';

export function buildCircleExternalInvite(
  circleId: string,
  circleName: string,
): CircleExternalInvite {
  const safeCircleId = encodeURIComponent(circleId.trim());
  const safeCircleName = normalizeCircleName(circleName);
  const appUrl = buildAppUrl(`circles/${safeCircleId}`);

  return {
    title: `Join ${safeCircleName} on Betweener`,
    appUrl,
    message: [
      `You're invited to ${safeCircleName} on Betweener.`,
      'Meet through shared context, then choose whether this Circle feels right for you.',
      '',
      `Open the Circle in Betweener: ${appUrl}`,
      '',
      'New to Betweener? Download the app, then return here and open the Circle link above.',
      `iPhone: ${BETWEENER_IOS_STORE_URL}`,
      `Android: ${BETWEENER_ANDROID_STORE_URL}`,
    ].join('\n'),
  };
}
