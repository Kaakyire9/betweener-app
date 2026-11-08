import { LIVE_PRODUCT_ENABLED } from '@/features/live/config/live-product-release';
import { Redirect, Stack } from 'expo-router';

export default function LiveLayout() {
  if (!LIVE_PRODUCT_ENABLED) {
    return <Redirect href="/live-unavailable" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
