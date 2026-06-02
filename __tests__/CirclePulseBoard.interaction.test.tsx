// @ts-nocheck
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CirclePulseBoard from '@/components/circles/CirclePulseBoard';

jest.mock('@/lib/responsive', () => ({
  useResponsiveMetrics: () => ({ compactWidth: false, compactHeight: false }),
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

const mockInlinePlayer = {
  loop: false,
  muted: false,
  play: jest.fn(),
  pause: jest.fn(),
};

jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props: any) => React.createElement(View, props),
    useVideoPlayer: (_uri: string, setup: (player: any) => void) => {
      setup(mockInlinePlayer);
      return mockInlinePlayer;
    },
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
  ],
};

describe('CirclePulseBoard', () => {
  it('uses the Circle join wording for non-members', () => {
    const onJoin = jest.fn();
    const { getByText } = render(
      <CirclePulseBoard
        items={[]}
        isMember={false}
        canManage={false}
        joinLabel="Request to join"
        onJoin={onJoin}
      />,
    );

    fireEvent.press(getByText('Request to join'));

    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('lets a host open the spotlight picker from an empty board', () => {
    const onAddToPulse = jest.fn();
    const { getByText } = render(
      <CirclePulseBoard items={[]} isMember canManage onAddToPulse={onAddToPulse} />,
    );

    fireEvent.press(getByText('Add to Pulse'));

    expect(onAddToPulse).toHaveBeenCalledTimes(1);
  });

  it('routes Prompt answers through the existing Circle flow', () => {
    const onAnswerPrompt = jest.fn();
    const { getByText } = render(
      <CirclePulseBoard
        items={[promptItem]}
        isMember
        canManage={false}
        onAnswerPrompt={onAnswerPrompt}
      />,
    );

    expect(getByText('First-date energy')).toBeTruthy();
    fireEvent.press(getByText('Answer'));

    expect(onAnswerPrompt).toHaveBeenCalledWith('prompt-1');
  });

  it('opens the selected spotlight discussion', () => {
    const onOpenComments = jest.fn();
    const { getByText } = render(
      <CirclePulseBoard
        items={[promptItem]}
        isMember
        canManage={false}
        onOpenComments={onOpenComments}
      />,
    );

    fireEvent.press(getByText('Start discussion'));

    expect(onOpenComments).toHaveBeenCalledWith(promptItem);
  });

  it('exposes profile and Signal actions for an accepted Love Seat', () => {
    const onOpenFeaturedProfile = jest.fn();
    const onSendSignal = jest.fn();
    const onOpenComments = jest.fn();
    const { getAllByText, getByText } = render(
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
    expect(getByText('Seats')).toBeTruthy();
    fireEvent.press(getByText('View profile'));
    fireEvent.press(getByText('Ask a question'));
    fireEvent.press(getByText('Send Signal'));

    expect(onOpenFeaturedProfile).toHaveBeenCalledWith('profile-2');
    expect(onOpenComments).toHaveBeenCalledWith(loveSeatItem);
    expect(onSendSignal).toHaveBeenCalledWith('profile-2', 'Akosua');
  });

  it('lets the featured member leave their Love Seat', () => {
    const onEndLoveSeat = jest.fn();
    const { getByText } = render(
      <CirclePulseBoard
        items={[loveSeatItem]}
        isMember
        canManage={false}
        viewerProfileId="profile-2"
        onEndLoveSeat={onEndLoveSeat}
      />,
    );

    fireEvent.press(getByText('Leave Love Seat'));

    expect(onEndLoveSeat).toHaveBeenCalledWith(loveSeatItem);
  });

  it('opens a selected video Moment and its discussion from the Media spotlight', () => {
    const onOpenMedia = jest.fn();
    const onOpenComments = jest.fn();
    const { getByLabelText, getByText } = render(
      <CirclePulseBoard
        items={[mediaItem]}
        isMember
        canManage={false}
        onOpenMedia={onOpenMedia}
        onOpenComments={onOpenComments}
      />,
    );

    expect(getByText('Video Moment')).toBeTruthy();
    expect(getByLabelText('Circle video preview')).toBeTruthy();
    expect(mockInlinePlayer.loop).toBe(true);
    expect(mockInlinePlayer.muted).toBe(true);
    fireEvent.press(getByText('Watch moment'));
    fireEvent.press(getByLabelText('Open media discussion'));

    expect(onOpenMedia).toHaveBeenCalledWith(mediaItem);
    expect(onOpenComments).toHaveBeenCalledWith(mediaItem);
  });

  it('renders a deliberate audio spotlight when there is no image preview', () => {
    const onOpenMedia = jest.fn();
    const audioItem = {
      ...mediaItem,
      id: 'pulse-audio',
      imageUrl: null,
      mediaUrl: 'https://example.com/moment.m4a',
      mediaType: 'audio',
    };
    const { getByText } = render(
      <CirclePulseBoard
        items={[audioItem]}
        isMember
        canManage={false}
        onOpenMedia={onOpenMedia}
      />,
    );

    expect(getByText('Audio Moment')).toBeTruthy();
    fireEvent.press(getByText('Listen now'));

    expect(onOpenMedia).toHaveBeenCalledWith(audioItem);
  });

  it('uses editorial copy for direct Circle Media images', () => {
    const onOpenMedia = jest.fn();
    const editorialItem = {
      ...mediaItem,
      id: 'pulse-poster',
      mediaUrl: 'https://example.com/gathering-poster.jpg',
      mediaType: 'image',
      momentId: null,
    };
    const { getByText } = render(
      <CirclePulseBoard
        items={[editorialItem]}
        isMember
        canManage={false}
        onOpenMedia={onOpenMedia}
      />,
    );

    expect(getByText('Circle Image')).toBeTruthy();
    fireEvent.press(getByText('View image'));

    expect(onOpenMedia).toHaveBeenCalledWith(editorialItem);
  });

  it('pages between separate Circle image and video spotlights with premium position dashes', async () => {
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
    const { getByLabelText, getByText } = render(
      <CirclePulseBoard items={[imageItem, videoItem]} isMember canManage={false} />,
    );

    expect(getByText('Gathering image')).toBeTruthy();
    expect(getByLabelText('Show Circle Media spotlight 1').props.accessibilityState.selected).toBe(true);
    fireEvent.press(getByLabelText('Next Circle spotlight'));

    await waitFor(() => expect(getByText('First date guide')).toBeTruthy());
    expect(getByLabelText('Show Circle Media spotlight 2').props.accessibilityState.selected).toBe(true);
  });

  it('pages new members inside the Welcome Seat and opens a targeted discussion', () => {
    const onOpenComments = jest.fn();
    const { getByLabelText, getByText } = render(
      <CirclePulseBoard items={[welcomeItem]} isMember canManage={false} onOpenComments={onOpenComments} />,
    );

    expect(getByText('Jennifer Doe')).toBeTruthy();
    expect(getByText('New')).toBeTruthy();
    expect(getByText('1 of 2')).toBeTruthy();
    fireEvent.press(getByLabelText('Next new member'));
    fireEvent.press(getByText('Welcome Ama'));

    expect(getByText('Ama Mensah')).toBeTruthy();
    expect(onOpenComments).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pulse-welcome',
      welcomeProfiles: expect.arrayContaining([
        expect.objectContaining({ profileId: 'profile-4' }),
      ]),
    }));
    expect(onOpenComments.mock.calls[0][0].welcomeProfiles[0].profileId).toBe('profile-4');
  });

  it('automatically advances the Pulse carousel', () => {
    jest.useFakeTimers();
    const gatheringItem = {
      ...promptItem,
      id: 'pulse-gathering',
      type: 'gathering',
      title: 'Sunday gathering',
      promptId: null,
      gatheringId: 'gathering-1',
    };
    const { getByText, unmount } = render(
      <CirclePulseBoard items={[promptItem, gatheringItem]} isMember canManage={false} />,
    );

    expect(getByText('First-date energy')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(getByText('Sunday gathering')).toBeTruthy();
    unmount();
    jest.useRealTimers();
  });
});
