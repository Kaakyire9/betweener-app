// @ts-nocheck
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CirclePulseCommentSheet from '@/components/circles/CirclePulseCommentSheet';

const mockSend = jest.fn();
const mockRemove = jest.fn();
const mockReport = jest.fn();
const mockToggleReaction = jest.fn();
const mockNotifyTyping = jest.fn();
const mockAnnounceDiscussionChanged = jest.fn();
let mockComments: any[] = [];

jest.mock('@/lib/circles/pulse/use-circle-pulse-comments', () => ({
  useCirclePulseComments: () => ({
    comments: mockComments,
    loading: false,
    error: null,
    reload: jest.fn(),
    send: mockSend,
    remove: mockRemove,
    report: mockReport,
    toggleReaction: mockToggleReaction,
  }),
}));

jest.mock('@/lib/circles/pulse/use-circle-pulse-live-discussion', () => ({
  useCirclePulseLiveDiscussion: () => ({
    activeViewerCount: 2,
    typingLabel: null,
    notifyTyping: mockNotifyTyping,
    announceDiscussionChanged: mockAnnounceDiscussionChanged,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-image', () => ({
  Image: (props: any) => {
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

describe('CirclePulseCommentSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComments = [];
  });

  it('keeps the typed comment when posting fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('offline'));
    const { getByLabelText, getByPlaceholderText, getByText } = await render(
      <CirclePulseCommentSheet
        visible
        item={promptItem}
        actorProfileId="profile-1"
        onClose={jest.fn()}
      />,
    );

    const input = getByPlaceholderText('Write something thoughtful...');
    await fireEvent.changeText(input, 'A calm conversation.');
    await fireEvent.press(getByLabelText('Send comment'));

    await waitFor(() => expect(getByText('Reconnect to comment. Your message is still here.')).toBeTruthy());
    expect(getByPlaceholderText('Write something thoughtful...').props.value).toBe('A calm conversation.');
  });

  it('clears the composer and refreshes the board count after posting', async () => {
    mockSend.mockResolvedValueOnce({ id: 'comment-1' });
    const onCommentsChanged = jest.fn();
    const { getByLabelText, getByPlaceholderText } = await render(
      <CirclePulseCommentSheet
        visible
        item={promptItem}
        actorProfileId="profile-1"
        onClose={jest.fn()}
        onCommentsChanged={onCommentsChanged}
      />,
    );

    await fireEvent.changeText(getByPlaceholderText('Write something thoughtful...'), 'Thoughtful reply.');
    await fireEvent.press(getByLabelText('Send comment'));

    await waitFor(() => expect(onCommentsChanged).toHaveBeenCalledTimes(1));
    expect(getByPlaceholderText('Write something thoughtful...').props.value).toBe('');
  });

  it('posts a reply against the selected parent comment', async () => {
    mockComments = [{
      id: 'comment-parent',
      itemId: 'pulse-1',
      circleId: 'circle-1',
      profileId: 'profile-2',
      displayName: 'Ama',
      avatarUrl: null,
      body: 'What would make it feel intentional?',
      parentCommentId: null,
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
      isOwn: false,
      canRemove: false,
      reportCount: 0,
      reactionCount: 0,
      myReaction: null,
    }];
    mockSend.mockResolvedValueOnce({ id: 'comment-reply' });
    const { getByLabelText, getByPlaceholderText } = await render(
      <CirclePulseCommentSheet
        visible
        item={promptItem}
        actorProfileId="profile-1"
        onClose={jest.fn()}
      />,
    );

    await fireEvent.press(getByLabelText('Reply to Ama'));
    await fireEvent.changeText(getByPlaceholderText('Write something thoughtful...'), 'A calm conversation.');
    await fireEvent.press(getByLabelText('Send comment'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith('A calm conversation.', 'comment-parent');
    });
  });

  it('reacts to a comment and announces the live discussion change', async () => {
    mockComments = [{
      id: 'comment-1',
      itemId: 'pulse-1',
      circleId: 'circle-1',
      profileId: 'profile-2',
      displayName: 'Ama',
      avatarUrl: null,
      body: 'Depth matters.',
      parentCommentId: null,
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
      isOwn: false,
      canRemove: false,
      reportCount: 0,
      reactionCount: 0,
      myReaction: null,
    }];
    mockToggleReaction.mockResolvedValueOnce(true);
    const { getByLabelText } = await render(
      <CirclePulseCommentSheet
        visible
        item={promptItem}
        actorProfileId="profile-1"
        onClose={jest.fn()}
      />,
    );

    await fireEvent.press(getByLabelText('React to Ama'));

    await waitFor(() => {
      expect(mockToggleReaction).toHaveBeenCalledWith('comment-1', 'heart');
      expect(mockAnnounceDiscussionChanged).toHaveBeenCalledTimes(1);
    });
  });

  it('closes the sheet before opening a commenter profile from the avatar', async () => {
    mockComments = [{
      id: 'comment-1',
      itemId: 'pulse-1',
      circleId: 'circle-1',
      profileId: 'profile-2',
      displayName: 'Ama',
      avatarUrl: null,
      body: 'Depth matters.',
      parentCommentId: null,
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
      isOwn: false,
      canRemove: false,
      reportCount: 0,
      reactionCount: 0,
      myReaction: null,
    }];
    const onClose = jest.fn();
    const onOpenProfile = jest.fn();
    const { getByLabelText } = await render(
      <CirclePulseCommentSheet
        visible
        item={promptItem}
        actorProfileId="profile-1"
        onClose={onClose}
        onOpenProfile={onOpenProfile}
      />,
    );

    await fireEvent.press(getByLabelText('View Ama profile'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).toHaveBeenCalledWith('profile-2');
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onOpenProfile.mock.invocationCallOrder[0]);
  });

  it('posts a ready-made greeting from a Welcome Seat discussion', async () => {
    mockSend.mockResolvedValueOnce({ id: 'comment-welcome' });
    const welcomeItem = {
      ...promptItem,
      id: 'pulse-welcome',
      type: 'welcome',
      title: 'Welcome new members',
      welcomeProfiles: [
        { profileId: 'profile-3', name: 'Jennifer Doe', avatarUrl: null, location: 'London', joinedAt: '2026-06-02T08:00:00.000Z' },
      ],
    };
    const { getByLabelText } = await render(
      <CirclePulseCommentSheet
        visible
        item={welcomeItem}
        actorProfileId="profile-1"
        onClose={jest.fn()}
      />,
    );

    await fireEvent.press(getByLabelText('Welcome Jennifer Doe'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith('Welcome to the Circle, Jennifer.', null);
    });
  });
});
