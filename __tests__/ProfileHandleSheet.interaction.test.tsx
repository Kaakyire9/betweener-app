// @ts-nocheck
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileHandleSheet from '@/components/profile/ProfileHandleSheet';

const mockGetState = jest.fn();
const mockCheckAvailability = jest.fn();
const mockUpdateHandle = jest.fn();

jest.mock('@/lib/profile/profile-handle-service', () => {
  const actual = jest.requireActual('@/lib/profile/profile-handle-service');
  return {
    ...actual,
    getMyProfileHandleState: (...args: any[]) => mockGetState(...args),
    checkProfileHandleAvailability: (...args: any[]) => mockCheckAvailability(...args),
    updateMyProfileHandle: (...args: any[]) => mockUpdateHandle(...args),
  };
});

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));

jest.mock('@/components/NativeWrappers/BlurViewSafe', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockBlurViewSafe({ children, ...props }: any) {
    return React.createElement(View, props, children);
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    MaterialCommunityIcons: ({ name }: any) => React.createElement(Text, null, name),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  notificationAsync: jest.fn().mockResolvedValue(undefined),
}));

const unclaimedState = {
  username: null,
  usernameSearchable: false,
  claimedAt: null,
  changedAt: null,
  nextChangeAt: null,
  canRename: true,
  cooldownDaysRemaining: 0,
};

describe('ProfileHandleSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('claims an available handle with explicit search consent', async () => {
    const onUpdated = jest.fn();
    mockGetState.mockResolvedValue(unclaimedState);
    mockCheckAvailability.mockResolvedValue({
      username: 'akosua',
      valid: true,
      available: true,
      ownedByViewer: false,
      reason: null,
    });
    mockUpdateHandle.mockResolvedValue({
      ...unclaimedState,
      username: 'akosua',
      usernameSearchable: true,
      canRename: false,
      cooldownDaysRemaining: 30,
    });

    const screen = await render(
      <ProfileHandleSheet visible onClose={jest.fn()} onUpdated={onUpdated} />,
    );

    await waitFor(() => expect(screen.getByText('Claim your handle')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Betweener handle'), '@Akosua');

    await waitFor(() => expect(screen.getByText('@akosua is yours to claim.')).toBeTruthy(), {
      timeout: 2000,
    });
    await fireEvent.press(screen.getByText('Claim this handle'));

    await waitFor(() => {
      expect(mockUpdateHandle).toHaveBeenCalledWith('akosua', true);
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ username: 'akosua' }));
    });
  }, 15000);

  it('allows privacy changes during a rename cooldown', async () => {
    const cooldownState = {
      ...unclaimedState,
      username: 'akosua',
      usernameSearchable: true,
      changedAt: '2026-09-06T12:00:00.000Z',
      nextChangeAt: '2026-10-06T12:00:00.000Z',
      canRename: false,
      cooldownDaysRemaining: 30,
    };
    mockGetState.mockResolvedValue(cooldownState);
    mockUpdateHandle.mockResolvedValue({ ...cooldownState, usernameSearchable: false });

    const screen = await render(<ProfileHandleSheet visible onClose={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('This handle belongs to you.')).toBeTruthy());
    await fireEvent(screen.getByLabelText('Allow people to find me by handle'), 'valueChange', false);
    await waitFor(() => {
      expect(screen.getByText('Save discoverability')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('Save discoverability'));

    await waitFor(() => {
      expect(mockUpdateHandle).toHaveBeenCalledWith('akosua', false);
    });
  });
});
