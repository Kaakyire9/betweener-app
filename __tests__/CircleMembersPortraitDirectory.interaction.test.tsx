// @ts-nocheck
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CircleMembersPortraitDirectory from '@/components/circles/CircleMembersPortraitDirectory';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

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

const members = [
  {
    profileId: 'profile-self',
    name: 'Ama Mensah',
    avatarUrl: 'https://example.com/ama.jpg',
    location: 'London',
    isSelf: true,
    conversationLabel: 'Shared Circle context',
    conversationSpark: 'You already share this Circle.',
    conversationKind: 'community',
  },
  {
    profileId: 'profile-kojo',
    name: 'Kojo Owusu',
    age: 31,
    avatarUrl: 'https://example.com/kojo.jpg',
    location: 'Accra',
    roleLabel: 'Host',
    conversationLabel: 'Intentional first dates',
    conversationSpark: 'A calm setting makes it easier to be fully present.',
    conversationKind: 'prompt',
    conversationId: 'prompt-1',
  },
  {
    profileId: 'profile-akua',
    name: 'Akua Boateng',
    avatarUrl: 'https://example.com/akua.jpg',
    location: 'Kumasi',
    isNew: true,
    conversationLabel: 'A new shared beginning',
    conversationSpark: 'Recently joined this Circle.',
    conversationKind: 'arrival',
  },
];

describe('CircleMembersPortraitDirectory', () => {
  it('uses authentic shared context for a stable conversation lead', async () => {
    const onOpenProfile = jest.fn();
    const onOpenConversation = jest.fn();
    const { getByLabelText, getByText } = await render(
      <CircleMembersPortraitDirectory
        circleId="circle-1"
        members={members}
        onOpenProfile={onOpenProfile}
        onOpenConversation={onOpenConversation}
      />,
    );

    expect(getByText('CONVERSATION LEAD')).toBeTruthy();
    expect(getByText('Kojo Owusu, 31')).toBeTruthy();
    expect(getByText('A calm setting makes it easier to be fully present.')).toBeTruthy();

    await fireEvent.press(getByText('Open their answer'));
    await fireEvent.press(getByLabelText('View Kojo Owusu profile'));

    expect(onOpenConversation).toHaveBeenCalledWith(members[1]);
    expect(onOpenProfile).toHaveBeenCalledWith('profile-kojo');
  });

  it('keeps management behind the portrait overflow control', async () => {
    const onManageMember = jest.fn();
    const { getByLabelText } = await render(
      <CircleMembersPortraitDirectory
        circleId="circle-1"
        members={members}
        onOpenProfile={jest.fn()}
        onManageMember={onManageMember}
      />,
    );

    await fireEvent.press(getByLabelText('Manage Kojo Owusu'));

    expect(onManageMember).toHaveBeenCalledWith('profile-kojo');
  });
});
