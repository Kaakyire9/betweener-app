// @ts-nocheck
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CirclePulseBoard from '@/components/circles/CirclePulseBoard';

jest.mock('@/lib/responsive', () => ({
  useResponsiveMetrics: () => ({ compactWidth: false, compactHeight: false }),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockRecordWelcomeEvent = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/circles/pulse/use-circle-pulse-welcome-state', () => ({
  useCirclePulseWelcomeState: () => ({
    seenProfileIds: new Set(),
    recordEvent: mockRecordWelcomeEvent,
  }),
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

const promptItem = {
  id: 'pulse-1',
  circleId: 'circle-1',
  type: 'prompt',
  title: 'First-date energy',
  subtitle: null,
  body: 'What makes a first date feel intentional to you?',
  imageUrl: null,
  mediaUrl: null,
  mediaType: null,
  promptId: 'prompt-1',
  gatheringId: null,
  momentId: null,
  status: 'active',
  priority: 1,
  startsAt: null,
  expiresAt: null,
  commentCount: 0,
  gatheringStartsAt: null,
  gatheringCity: null,
  gatheringType: null,
  gatheringIsPartnerVenue: false,
  gatheringSafeFirstDateSpace: false,
  gatheringAttendeeCount: 0,
  sourceAvailable: true,
};

const loveSeatItem = {
  ...promptItem,
  id: 'pulse-love-seat',
  type: 'love_seat',
  title: 'Love Seat',
  body: 'Looking for depth and laughter.',
  promptId: null,
  loveSeatId: 'love-seat-1',
  featuredProfileId: 'profile-2',
  featuredProfileName: 'Akosua',
  featuredProfileAge: 28,
  featuredProfileAvatarUrl: null,
  featuredProfileLocation: 'Accra, Ghana',
  featuredProfileBadge: 'Verified',
  loveSeatQuote: 'Looking for depth and laughter.',
};

const mediaItem = {
  ...promptItem,
  id: 'pulse-media',
  type: 'media',
  title: 'A thoughtful evening',
  subtitle: 'From the Circle hosts',
  body: 'A quiet look at the community gathering.',
  imageUrl: 'https://example.com/moment-thumbnail.jpg',
  mediaUrl: 'https://example.com/moment.mp4',
  mediaType: 'video',
  promptId: null,
  momentId: 'moment-1',
  commentCount: 3,
};

const welcomeItem = {
  ...promptItem,
  id: 'pulse-welcome',
  type: 'welcome',
  title: 'Welcome new members',
  body: 'Say hello.',
  promptId: null,
  welcomeProfiles: [
    { profileId: 'profile-3', name: 'Jennifer Doe', avatarUrl: null, location: 'London', joinedAt: '2026-06-02T08:00:00.000Z' },
    { profileId: 'profile-4', name: 'Ama Mensah', avatarUrl: null, location: 'Accra', joinedAt: '2026-06-01T08:00:00.000Z' },
    { profileId: 'profile-5', name: 'Kojo Smith', avatarUrl: null, location: 'Kumasi', joinedAt: '2026-05-31T08:00:00.000Z' },
    { profileId: 'profile-6', name: 'Naa Ofori', avatarUrl: null, location: 'Tema', joinedAt: '2026-05-30T08:00:00.000Z' },
  ],
};

const welcomeSeatItems = welcomeItem.welcomeProfiles.map((profile, index) => ({
  ...welcomeItem,
  id: `pulse-welcome-${profile.profileId}`,
  title: 'Welcome new member',
  commentCount: index === 1 ? 2 : 0,
  welcomeProfiles: [profile],
}));

describe('CirclePulseBoard', () => {
  it('uses the Circle join wording for non-members', async () => {
    const onJoin = jest.fn();
    const { getByText } = await render(
      <CirclePulseBoard
        items={[]}
        isMember={false}
        canManage={false}
        joinLabel="Request to join"
        onJoin={onJoin}
      />,
    );

    await fireEvent.press(getByText('Request to join'));

    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('lets a host open the spotlight picker from an empty board', async () => {
    const onAddToPulse = jest.fn();
    const { getByText } = await render(
      <CirclePulseBoard items={[]} isMember canManage onAddToPulse={onAddToPulse} />,
    );

    await fireEvent.press(getByText('Add to Pulse'));

    expect(onAddToPulse).toHaveBeenCalledTimes(1);
  });

  it('routes Prompt answers through the existing Circle flow', async () => {
    const onAnswerPrompt = jest.fn();
    const { getByText } = await render(
      <CirclePulseBoard
        items={[promptItem]}
        isMember
        canManage={false}
        onAnswerPrompt={onAnswerPrompt}
      />,
    );

    expect(getByText('First-date energy')).toBeTruthy();
    await fireEvent.press(getByText('Answer'));

    expect(onAnswerPrompt).toHaveBeenCalledWith('prompt-1');
  });

  it('opens the selected spotlight discussion', async () => {
    const onOpenComments = jest.fn();
    const { getByText } = await render(
      <CirclePulseBoard
        items={[promptItem]}
        isMember
        canManage={false}
        onOpenComments={onOpenComments}
      />,
    );

    await fireEvent.press(getByText('Start discussion'));

    expect(onOpenComments).toHaveBeenCalledWith(promptItem);
  });

  it('exposes profile and Signal actions for an accepted Love Seat', async () => {
    const onOpenFeaturedProfile = jest.fn();
    const onSendSignal = jest.fn();
    const onOpenComments = jest.fn();
    const { getAllByText, getByText } = await render(
      <CirclePulseBoard
        items={[loveSeatItem]}
        isMember
        canManage={false}
        viewerProfileId="profile-1"
        onOpenFeaturedProfile={onOpenFeaturedProfile}
        onSendSignal={onSendSignal}
        onOpenComments={onOpenComments}
      />,
    );

    expect(getByText('Akosua, 28')).toBeTruthy();
    expect(getAllByText('Love Seat')).toHaveLength(1);
    await fireEvent.press(getByText('Meet Akosua'));
    await fireEvent.press(getByText('Start conversation'));
    await fireEvent.press(getByText('Send Signal'));

    expect(onOpenFeaturedProfile).toHaveBeenCalledWith('profile-2');
    expect(onOpenComments).toHaveBeenCalledWith(loveSeatItem);
    expect(onSendSignal).toHaveBeenCalledWith('profile-2', 'Akosua');
  });

  it('lets the featured member leave their Love Seat', async () => {
    const onEndLoveSeat = jest.fn();
    const { getByLabelText } = await render(
      <CirclePulseBoard
        items={[loveSeatItem]}
        isMember
        canManage={false}
        viewerProfileId="profile-2"
        onEndLoveSeat={onEndLoveSeat}
      />,
    );

    await fireEvent.press(getByLabelText('Leave Love Seat options'));

    expect(onEndLoveSeat).toHaveBeenCalledWith(loveSeatItem);
  });

  it('opens a selected video Moment and its discussion from the Media spotlight', async () => {
    const onOpenMedia = jest.fn();
    const onOpenComments = jest.fn();
    const { getByLabelText, getByText } = await render(
      <CirclePulseBoard
        items={[mediaItem]}
        isMember
        canManage={false}
        onOpenMedia={onOpenMedia}
        onOpenComments={onOpenComments}
      />,
    );

    expect(getByText('Video Moment')).toBeTruthy();
    expect(getByLabelText('Open Circle media')).toBeTruthy();
    await fireEvent.press(getByText('Watch moment'));
    await fireEvent.press(getByLabelText('Open media discussion'));

    expect(onOpenMedia).toHaveBeenCalledWith(mediaItem);
    expect(onOpenComments).toHaveBeenCalledWith(mediaItem);
  });

  it('renders a deliberate audio spotlight when there is no image preview', async () => {
    const onOpenMedia = jest.fn();
    const audioItem = {
      ...mediaItem,
      id: 'pulse-audio',
      imageUrl: null,
      mediaUrl: 'https://example.com/moment.m4a',
      mediaType: 'audio',
    };
    const { getByText } = await render(
      <CirclePulseBoard
        items={[audioItem]}
        isMember
        canManage={false}
        onOpenMedia={onOpenMedia}
      />,
    );

    expect(getByText('Audio Moment')).toBeTruthy();
    await fireEvent.press(getByText('Listen now'));

    expect(onOpenMedia).toHaveBeenCalledWith(audioItem);
  });

  it('uses editorial copy for direct Circle Media images', async () => {
    const onOpenMedia = jest.fn();
    const editorialItem = {
      ...mediaItem,
      id: 'pulse-poster',
      mediaUrl: 'https://example.com/gathering-poster.jpg',
      mediaType: 'image',
      momentId: null,
    };
    const { getByText } = await render(
      <CirclePulseBoard
        items={[editorialItem]}
        isMember
        canManage={false}
        onOpenMedia={onOpenMedia}
      />,
    );

    expect(getByText('Circle Image')).toBeTruthy();
    await fireEvent.press(getByText('View image'));

    expect(onOpenMedia).toHaveBeenCalledWith(editorialItem);
  });

  it('shows separate Circle media spotlights in one vertical journal', async () => {
    const imageItem = {
      ...mediaItem,
      id: 'pulse-image',
      title: 'Gathering image',
      mediaUrl: 'https://example.com/gathering.jpg',
      mediaType: 'image',
      momentId: null,
    };
    const videoItem = {
      ...mediaItem,
      id: 'pulse-video',
      title: 'First date guide',
      imageUrl: null,
      mediaUrl: 'https://example.com/guide.mp4',
      mediaType: 'video',
      momentId: null,
    };
    const { getByText, queryByLabelText } = await render(
      <CirclePulseBoard items={[imageItem, videoItem]} isMember canManage={false} />,
    );

    expect(getByText('Gathering image')).toBeTruthy();
    expect(getByText('First date guide')).toBeTruthy();
    expect(getByText('Moments worth opening')).toBeTruthy();
    expect(queryByLabelText('Next Circle spotlight')).toBeNull();
  });

  it('keeps Welcome in its own constellation while other Pulse sections stay visible', async () => {
    const { getByText, getByLabelText, queryByLabelText } = await render(
      <CirclePulseBoard
        items={[promptItem, ...welcomeSeatItems.slice(0, 2), loveSeatItem]}
        isMember
        canManage={false}
      />,
    );

    expect(getByText('First-date energy')).toBeTruthy();
    expect(getByText('Welcome constellation')).toBeTruthy();
    expect(getByLabelText('View Jennifer Doe profile')).toBeTruthy();
    expect(getByLabelText('View Ama Mensah profile')).toBeTruthy();
    expect(getByText('Akosua, 28')).toBeTruthy();
    expect(queryByLabelText('Next new member')).toBeNull();
  });

  it('opens every new member in one gallery and targets the selected welcome discussion', async () => {
    const onOpenComments = jest.fn();
    const { getByLabelText, getByText } = await render(
      <CirclePulseBoard
        items={welcomeSeatItems}
        isMember
        canManage={false}
        welcomeProfileLocationsById={{
          'profile-3': 'London 🇬🇧',
          'profile-4': 'Accra 🇬🇭',
        }}
        onOpenComments={onOpenComments}
      />,
    );

    expect(getByText('4 new to you')).toBeTruthy();
    await fireEvent.press(getByLabelText('Meet all 4 new members'));
    expect(getByText('Jennifer Doe')).toBeTruthy();
    expect(getByText('Ama Mensah')).toBeTruthy();
    expect(getByText('London 🇬🇧')).toBeTruthy();
    expect(getByText('Accra 🇬🇭')).toBeTruthy();
    await fireEvent.press(getByText('Welcome Ama'));

    expect(onOpenComments).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pulse-welcome-profile-4',
      welcomeProfiles: expect.arrayContaining([
        expect.objectContaining({ profileId: 'profile-4' }),
      ]),
    }));
    expect(onOpenComments.mock.calls[0][0].welcomeProfiles[0].profileId).toBe('profile-4');
  });

  it('keeps priority and supporting content stable without auto-advance controls', async () => {
    const gatheringItem = {
      ...promptItem,
      id: 'pulse-gathering',
      type: 'gathering',
      title: 'Sunday gathering',
      promptId: null,
      gatheringId: 'gathering-1',
    };
    const { getByText, queryByLabelText } = await render(
      <CirclePulseBoard items={[promptItem, gatheringItem]} isMember canManage={false} />,
    );

    expect(getByText('First-date energy')).toBeTruthy();
    expect(getByText('Sunday gathering')).toBeTruthy();
    expect(queryByLabelText('Next Circle spotlight')).toBeNull();
    expect(queryByLabelText('Previous Circle spotlight')).toBeNull();
  });
});
