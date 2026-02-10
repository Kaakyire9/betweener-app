import { useEffect, useState } from 'react';
import { ColorSchemeName, useColorScheme as useRNColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'themePreference';

export async function setColorSchemePreference(value: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

function getStoredPreference(): ThemePreference | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

export function useColorSchemePreference() {
  const systemScheme = useRNColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
    const stored = getStoredPreference();
    if (stored) setPreference(stored);
  }, []);

  const resolved: NonNullable<ColorSchemeName> =
    preference === 'system'
      ? (systemScheme ?? 'light')
      : preference;

  return {
    resolvedScheme: hasHydrated ? resolved : 'light',
    preference,
    setPreference: (value: ThemePreference) => {
      setPreference(value);
      void setColorSchemePreference(value);
    },
  };
}

export function useColorScheme(): NonNullable<ColorSchemeName> {
  const { resolvedScheme } = useColorSchemePreference();
  return resolvedScheme;
}
