import {
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  type Call,
} from '@stream-io/video-react-sdk';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { studioApi, type StudioMediaAdmission } from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';

type MediaBinding = {
  admission: StudioMediaAdmission;
  client: StreamVideoClient;
  call: Call;
};

type StudioMediaContextValue = {
  binding: MediaBinding | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const StudioMediaContext = createContext<StudioMediaContextValue | null>(null);

export function StudioMediaProvider({
  sessionId,
  controllerInstanceId,
  children,
}: PropsWithChildren<{ sessionId: string; controllerInstanceId: string }>) {
  const [binding, setBinding] = useState<MediaBinding | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bindingRef = useRef<MediaBinding | null>(null);

  const disconnect = useCallback(async () => {
    const current = bindingRef.current;
    bindingRef.current = null;
    setBinding(null);
    if (!current) return;
    await current.call.camera.disable().catch(() => undefined);
    await current.call.microphone.disable().catch(() => undefined);
    await current.call.screenShare.disable().catch(() => undefined);
    await current.call.leave().catch(() => undefined);
    await current.client.disconnectUser().catch(() => undefined);
  }, []);

  const connect = useCallback(async () => {
    if (bindingRef.current || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const admission = await studioApi.requestMediaAdmission(
        sessionId,
        controllerInstanceId,
        'studio_host',
      );
      const tokenProvider = async () => (
        await studioApi.requestMediaAdmission(sessionId, controllerInstanceId, 'studio_host')
      ).token;
      const client = new StreamVideoClient({
        apiKey: admission.apiKey,
        user: admission.user,
        token: admission.token,
        tokenProvider,
        options: {
          devicePersistence: {
            enabled: true,
            storageKey: 'betweener-studio-media-devices',
          },
        },
      });
      const call = client.call(admission.call.type, admission.call.id);
      await call.join({ create: false });
      const next = { admission, client, call };
      bindingRef.current = next;
      setBinding(next);
    } catch (failure) {
      setError(errorMessage(failure, 'Studio media could not connect.'));
    } finally {
      setConnecting(false);
    }
  }, [connecting, controllerInstanceId, sessionId]);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  const value = useMemo(() => ({ binding, connecting, error, connect, disconnect }), [
    binding, connect, connecting, disconnect, error,
  ]);
  const content = <StudioMediaContext.Provider value={value}>{children}</StudioMediaContext.Provider>;
  if (!binding) return content;
  return (
    <StreamVideo client={binding.client}>
      <StreamCall call={binding.call}>{content}</StreamCall>
    </StreamVideo>
  );
}

export const useStudioMedia = (): StudioMediaContextValue => {
  const value = useContext(StudioMediaContext);
  if (!value) throw new Error('StudioMediaProvider is missing.');
  return value;
};
