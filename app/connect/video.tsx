import { useRouter } from 'expo-router';
import React from 'react';
import { useConnectProduct } from '@/features/connect/components/ConnectProductProvider';
import { ConnectStatusScreen } from '@/features/connect/components/ConnectStatusScreen';
import { VideoCallPreparation } from '@/features/connect/components/VideoCallPreparation';
export default function VideoPreparationRoute() {
  const { ui } = useConnectProduct(), router = useRouter();
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/intent');
  if (!ui) return <ConnectStatusScreen onClose={close} />;
  return <VideoCallPreparation state={{ consent: 'not_requested', cameraPermission: 'not_requested', camera: 'off', facing: 'front', microphoneMuted: true }} onClose={close} />;
}
