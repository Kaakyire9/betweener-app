// @ts-nocheck
import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

let mockParams: Record<string, any> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
    replace: (...args: any[]) => mockReplace(...args),
    back: (...args: any[]) => mockBack(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/hooks/useMoments', () => ({
  useMoments: () => ({
    momentUsers: [],
    loading: false,
    refresh: jest.fn(),
    offlineMediaByMomentId: {},
  }),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    profile: null,
    user: null,
  }),
}));

jest.mock('@/lib/moments-eligibility', () => ({
  fetchMomentPostingEligibility: jest.fn(async () => null),
}));
jest.mock('@/lib/moments', () => ({
  createSignedUrl: jest.fn(async () => null),
}));
jest.mock('@/lib/moments-offline-actions', () => ({
  deleteMomentOfflineSafe: jest.fn(),
}));
jest.mock('@/lib/offline/moments-store', () => ({
  mergeOwnMomentsSnapshot: jest.fn(),
  removeMomentFromFeedSnapshot: jest.fn(),
  removeOwnMomentSnapshot: jest.fn(),
  primeOfflineMomentMedia: jest.fn(async () => ({})),
  readOwnMomentsSnapshot: jest.fn(async () => null),
  resolveOfflineMomentMediaMap: jest.fn(async () => ({})),
}));
jest.mock('@/lib/offline/mutation-queue', () => ({
  getMomentOfflineMutationSnapshot: jest.fn(async () => ({ pending: [], failed: [] })),
  retryFailedOfflineMutations: jest.fn(async () => {}),
  subscribeToOfflineMutationEvents: jest.fn(() => () => {}),
}));
jest.mock('@/lib/moments-views', () => ({
  fetchMyMomentViewStats: jest.fn(async () => ({})),
}));
jest.mock('@/lib/supabase', () => {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    gt: jest.fn(() => chain),
    order: jest.fn(async () => ({ data: [], error: null })),
  };
  return {
    supabase: {
      from: jest.fn(() => chain),
    },
  };
});
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/components/MomentViewer', () => function MockMomentViewer() {
  return null;
});
jest.mock('@/components/MomentsRow', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockMomentsRow() {
    return React.createElement(View);
  };
});
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: function MockExpoImage(props: any) {
      return React.createElement(View, props);
    },
  };
});

import MomentsScreen from '@/app/moments/index';

describe('Moments screen circle context', () => {
  beforeEach(() => {
    mockParams = {};
    mockPush.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
  });

  it('shows circle context and routes back to the circle when launched from Circles', () => {
    mockParams = {
      source: 'circles',
      circleId: 'circle-123',
      circleName: 'Test Circle',
    };

    const { getByText, getByLabelText } = render(<MomentsScreen />);

    expect(getByText('Inside Test Circle')).toBeTruthy();

    fireEvent.press(getByLabelText('Back'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/circles/[id]',
      params: { id: 'circle-123' },
    });
  });

  it('preserves circle context when opening Moment creation', () => {
    mockParams = {
      source: 'circles',
      circleId: 'circle-123',
      circleName: 'Test Circle',
    };

    const { getByText } = render(<MomentsScreen />);

    fireEvent.press(getByText('Post a Moment'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/moments/create',
      params: {
        source: 'circles',
        circleId: 'circle-123',
        circleName: 'Test Circle',
      },
    });
  });
});
