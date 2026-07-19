// @ts-nocheck
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

let mockParams: Record<string, any> = {};
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: any[]) => mockReplace(...args),
    back: (...args: any[]) => mockBack(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    profile: null,
    user: null,
  }),
}));

jest.mock('@/lib/moments-eligibility', () => ({
  fetchMomentPostingEligibility: jest.fn(async () => null),
  getMomentPostingErrorMessage: jest.fn(() => 'failed'),
}));

jest.mock('@/lib/moments-offline-actions', () => ({
  createMomentFromMediaOfflineSafe: jest.fn(),
  createTextMomentOfflineSafe: jest.fn(),
}));

jest.mock('@/lib/offline/moments-store', () => ({
  appendMomentsFeedSnapshot: jest.fn(),
  appendOwnMomentSnapshot: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/components/moments/TextMomentCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockTextMomentCard() {
    return React.createElement(View);
  };
});
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  UIImagePickerControllerQualityType: { Medium: 'Medium' },
  VideoExportPreset: { H264_1280x720: 'H264_1280x720' },
}));

const MomentCreateScreen = require('@/app/moments/create').default;

describe('Moment create circle context', () => {
  beforeEach(() => {
    mockParams = {};
    mockReplace.mockReset();
    mockBack.mockReset();
  });

  it('shows the circle context banner when launched from a circle', async () => {
    mockParams = {
      source: 'circles',
      circleId: 'circle-123',
      circleName: 'Test Circle',
    };

    const { getByText } = await render(<MomentCreateScreen />);

    expect(getByText('From Test Circle')).toBeTruthy();
  });

  it('returns to the circle when the close control is pressed', async () => {
    mockParams = {
      source: 'circles',
      circleId: 'circle-123',
      circleName: 'Test Circle',
    };

    const { getByLabelText } = await render(<MomentCreateScreen />);

    await fireEvent.press(getByLabelText('Close'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/circles/[id]',
      params: { id: 'circle-123' },
    });
  });
});
