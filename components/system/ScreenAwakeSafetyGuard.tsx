import { useEffect } from 'react';
import { AppState } from 'react-native';
import { releaseAllScreenAwakeLocks, resetExternalKeepAwakeIfIdle } from '@/lib/device/screen-awake';

export default function ScreenAwakeSafetyGuard() {
  useEffect(() => {
    void resetExternalKeepAwakeIfIdle('guard_mount');

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        void releaseAllScreenAwakeLocks(`app_background:${nextState}`);
        return;
      }

      if (nextState === 'active') {
        void resetExternalKeepAwakeIfIdle('app_foreground:active');
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}
