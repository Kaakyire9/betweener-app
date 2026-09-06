// @ts-nocheck
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { CircleDiscoveryIntroduction } from '@/features/circles/components/CircleDiscoveryIntroduction';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'dark',
}));

jest.mock('@/components/VerificationBadge', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    VerificationBadge: ({ level, variant, surface }: any) => (
      React.createElement(Text, null, `${variant}-${surface}-${level}`)
    ),
  };
});

jest.mock('expo-image', () => ({
  Image: (props: any) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, props);
  },
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    MaterialCommunityIcons: ({ name }: any) => React.createElement(Text, null, name),
  };
});

const candidate = {
  profileId: 'profile-akosua',
  fullName: 'Akosua Mensah',
  age: 25,
  avatarUrl: 'https://example.com/akosua.jpg',
  city: 'Bristol',
  country: 'United Kingdom',
  lookingFor: 'A meaningful relationship',
  verificationLevel: 2,
  reasons: ['Shared Circle', 'Similar priorities', 'Active recently'],
};

describe('CircleDiscoveryIntroduction', () => {
  it('frames a candidate as a branded shared-context introduction', async () => {
    const { getByText } = await render(
      <CircleDiscoveryIntroduction
        candidate={candidate}
        circleName="30+ Intentional Dating"
        remainingCount={12}
        onPass={jest.fn()}
        onOpenProfile={jest.fn()}
        onSendIntent={jest.fn()}
      />,
    );

    expect(getByText('A CIRCLE INTRODUCTION')).toBeTruthy();
    expect(getByText('Akosua Mensah, 25')).toBeTruthy();
    expect(getByText('Bristol, United Kingdom 🇬🇧')).toBeTruthy();
    expect(getByText('INTRODUCTIONS\nREADY')).toBeTruthy();
    expect(getByText('betweener-explore-2')).toBeTruthy();
    expect(getByText('WHY THIS INTRODUCTION')).toBeTruthy();
    expect(getByText('“What first brought you to 30+ Intentional Dating?”')).toBeTruthy();
  });

  it('preserves pass, profile, and Intent actions', async () => {
    const onPass = jest.fn();
    const onOpenProfile = jest.fn();
    const onSendIntent = jest.fn();
    const { getByLabelText } = await render(
      <CircleDiscoveryIntroduction
        candidate={candidate}
        circleName="30+ Intentional Dating"
        remainingCount={12}
        onPass={onPass}
        onOpenProfile={onOpenProfile}
        onSendIntent={onSendIntent}
      />,
    );

    await fireEvent.press(getByLabelText('Pass Akosua Mensah'));
    await fireEvent.press(getByLabelText('View Akosua Mensah profile'));
    await fireEvent.press(getByLabelText('Send Intent to Akosua Mensah'));

    expect(onPass).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    expect(onSendIntent).toHaveBeenCalledTimes(1);
  });
});
