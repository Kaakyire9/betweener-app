import { Stack } from 'expo-router';
export default function ConnectLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
