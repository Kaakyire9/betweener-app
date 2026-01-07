import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ColorSchemeName, useColorScheme as useRNColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'themePreference';
const subscribers = new Set<(value: ThemePreference) => void>();
let preferenceCache: ThemePreference | null = null;

const notify = (value: ThemePreference) => {
	subscribers.forEach((fn) => fn(value));
};

export async function setColorSchemePreference(value: ThemePreference) {
	preferenceCache = value;
	try {
		await AsyncStorage.setItem(STORAGE_KEY, value);
	} catch {
		// ignore persistence errors
	}
	notify(value);
}

async function getStoredPreference(): Promise<ThemePreference | null> {
	if (preferenceCache) return preferenceCache;
	try {
		const stored = await AsyncStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark' || stored === 'system') {
			preferenceCache = stored;
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

	useEffect(() => {
		let mounted = true;
		getStoredPreference().then((stored) => {
			if (mounted && stored) {
				setPreference(stored);
			}
		});

		const handle = (value: ThemePreference) => setPreference(value);
		subscribers.add(handle);
		return () => {
			mounted = false;
			subscribers.delete(handle);
		};
	}, []);

	const resolved: NonNullable<ColorSchemeName> =
		preference === 'system'
			? (systemScheme ?? 'light')
			: preference;

	return {
		resolvedScheme: resolved,
		preference,
		setPreference: setColorSchemePreference,
	};
}

export function useColorScheme(): NonNullable<ColorSchemeName> {
	const { resolvedScheme } = useColorSchemePreference();
	return resolvedScheme;
}
