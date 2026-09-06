// @ts-nocheck
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import CircleInviteSheet from '@/components/circles/CircleInviteSheet';

const mockSearchCandidates = jest.fn();
const mockInviteProfile = jest.fn();

jest.mock('@/lib/circles/circle-invitations', () => ({
  searchCircleInviteCandidates: (...args: any[]) => mockSearchCandidates(...args),
  inviteProfileToCircle: (...args: any[]) => mockInviteProfile(...args),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'dark',
}));

jest.mock('@/components/NativeWrappers/BlurViewSafe', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockBlurViewSafe({ children, ...props }: any) {
    return React.createElement(View, props, children);
  };
});

jest.mock('expo-image', () => ({
  Image: function MockExpoImage(props: any) {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, props);
  },
}));

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

describe('CircleInviteSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchCandidates.mockResolvedValue([
      {
        profileId: 'profile-jennifer',
        fullName: 'Jennifer',
        username: 'jennifer',
        avatarUrl: null,
        age: 35,
        location: 'London',
        country: 'United Kingdom',
        interests: ['Culture', 'Travel'],
      },
    ]);
  });

  it('searches members and sends an internal invitation', async () => {
    mockInviteProfile.mockResolvedValue(undefined);
    const { getByLabelText, getByText } = await render(
      <CircleInviteSheet
        visible
        circleId="circle-1"
        circleName="Betweener Circles"
        actorProfileId="profile-host"
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(getByText('Jennifer, 35')).toBeTruthy();
      expect(getByText(/@jennifer/)).toBeTruthy();
    });
    await fireEvent.press(getByLabelText('Invite Jennifer'));

    await waitFor(() => {
      expect(mockInviteProfile).toHaveBeenCalledWith('circle-1', 'profile-host', 'profile-jennifer');
      expect(getByText('Sent')).toBeTruthy();
    });
  });

  it('opens external sharing only after the external option is selected', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { getByText } = await render(
      <CircleInviteSheet
        visible
        circleId="circle-1"
        circleName="Betweener Circles"
        actorProfileId="profile-host"
        onClose={jest.fn()}
      />,
    );

    expect(shareSpy).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Invite outside Betweener'));

    await waitFor(() => expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Join Betweener Circles on Betweener',
        message: expect.stringMatching(
          /betweenerapp:\/\/circles\/circle-1[\s\S]*apps\.apple\.com\/gb\/app\/betweener\/id6753134347[\s\S]*play\.google\.com\/store\/apps\/details\?id=com\.aduboffour\.betweener&pcampaignid=web_share/,
        ),
      }),
      expect.objectContaining({
        subject: 'Join Betweener Circles on Betweener',
        dialogTitle: 'Join Betweener Circles on Betweener',
      }),
    ));
    shareSpy.mockRestore();
  });
});
