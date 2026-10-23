import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import PasswordLoginScreen from '@/app/(auth)/password-login';

const mockCanGoBack = jest.fn(() => true);
const mockRouter = {
  back: jest.fn(),
  canGoBack: mockCanGoBack,
  push: jest.fn(),
  replace: jest.fn(),
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => mockRouter,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: require('react-native').View,
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    isAuthenticating: false,
    signIn: jest.fn(),
  }),
}));

jest.mock('@/lib/haptics', () => ({
  haptics: {
    error: jest.fn(),
    success: jest.fn(),
    tap: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

afterEach(async () => {
  await cleanup();
});

test('password sign-in can return to history or the main sign-in screen', async () => {
  const screen = await render(<PasswordLoginScreen />);

  await fireEvent.press(screen.getByLabelText('Back to sign in'));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);

  await fireEvent.press(screen.getByText('More sign-in options'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
});

test('direct-entry back falls safely to main sign-in and account creation remains reachable', async () => {
  mockCanGoBack.mockReturnValue(false);
  const screen = await render(<PasswordLoginScreen />);

  await fireEvent.press(screen.getByLabelText('Back to sign in'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');

  await fireEvent.press(screen.getByText('New here? Create an account'));
  expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/welcome');
});
