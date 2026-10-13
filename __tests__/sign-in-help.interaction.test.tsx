import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import {
  beginSignInMethodAttempt,
  completeSignInMethodAttempt,
} from '@/lib/auth/last-sign-in-method';
import SignInHelpScreen from '@/app/(auth)/sign-in-help';

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: require('react-native').View,
}));

beforeEach(async () => {
  process.env.EXPO_PUBLIC_ENVIRONMENT = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://help-test.supabase.co';
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  await cleanup();
});

test('a signed-out user sees and can choose the accurately remembered method', async () => {
  const attempt = await beginSignInMethodAttempt('password');
  await completeSignInMethodAttempt({
    attemptId: attempt.attemptId,
    method: 'password',
    sessionUserId: '00000000-0000-4000-8000-000000000001',
  });

  const screen = await render(<SignInHelpScreen />);
  const remembered = await screen.findByText('LAST USED ON THIS DEVICE');
  expect(remembered).toBeTruthy();

  await fireEvent.press(screen.getByText('Continue with Email and password'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/password-login');
});

test('known-email help routes to existing-account email-link mode without provider lookup', async () => {
  const screen = await render(<SignInHelpScreen />);
  expect(await screen.findByText('No reliable history on this device')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Existing account email'), 'known@example.com');
  await fireEvent.press(screen.getByText('Continue to email-link sign in'));

  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/(auth)/magic-link',
    params: { email: 'known@example.com', mode: 'signin' },
  });
});

test('signed-out help exposes the established support route', async () => {
  const screen = await render(<SignInHelpScreen />);
  await waitFor(() => expect(screen.getByText('Open Betweener support')).toBeTruthy());

  await fireEvent.press(screen.getByText('Open Betweener support'));
  expect(mockRouter.push).toHaveBeenCalledWith('/support-center');
});
