// @ts-nocheck
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CirclePulseMediaViewer from '@/components/circles/CirclePulseMediaViewer';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 44, right: 0, bottom: 0, left: 0 }),
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

jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props: any) => React.createElement(View, props),
    useVideoPlayer: (_uri: string, setup?: (player: any) => void) => {
      const player = {};
      setup?.(player);
      return player;
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

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    State: { ACTIVE: 4 },
    GestureHandlerRootView: ({ children, ...props }: any) => React.createElement(View, props, children),
    PanGestureHandler: ({ children, ...props }: any) => React.createElement(View, { ...props, accessibilityLabel: 'Dismiss Circle video gesture' }, children),
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});

const editorialItem = {
  id: 'pulse-poster',
  circleId: 'circle-1',
  type: 'media',
  title: 'Gathering poster',
  subtitle: 'Sunday in Accra',
  body: 'Come ready for a calm evening.',
  imageUrl: 'https://example.com/poster.jpg',
  mediaUrl: 'https://example.com/poster.jpg',
  mediaType: 'image',
  promptId: null,
  gatheringId: null,
  momentId: null,
  loveSeatId: null,
  featuredProfileId: null,
  featuredProfileName: null,
  featuredProfileAge: null,
  featuredProfileAvatarUrl: null,
  featuredProfileLocation: null,
  featuredProfileBadge: null,
  loveSeatQuote: null,
  status: 'active',
  priority: 1,
  startsAt: null,
  expiresAt: null,
  commentCount: 2,
  gatheringStartsAt: null,
  gatheringCity: null,
  gatheringType: null,
  gatheringIsPartnerVenue: false,
  gatheringSafeFirstDateSpace: false,
  gatheringAttendeeCount: 0,
  sourceAvailable: true,
};

describe('CirclePulseMediaViewer', () => {
  it('opens discussion from a direct Circle Media poster', async () => {
    const onClose = jest.fn();
    const onOpenComments = jest.fn();
    const { getByText } = await render(
      <CirclePulseMediaViewer
        visible
        item={editorialItem}
        onClose={onClose}
        onOpenComments={onOpenComments}
      />,
    );

    expect(getByText('Gathering poster')).toBeTruthy();
    await fireEvent.press(getByText('2 comments'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenComments).toHaveBeenCalledWith(editorialItem);
  });

  it('uses intro-video chrome for direct Circle videos', async () => {
    const videoItem = {
      ...editorialItem,
      id: 'pulse-video',
      title: 'First-date guide',
      subtitle: 'A short Circle guide',
      imageUrl: null,
      mediaUrl: 'https://example.com/guide.mp4',
      mediaType: 'video',
    };
    const { getByLabelText, getByText } = await render(
      <CirclePulseMediaViewer
        visible
        item={videoItem}
        onClose={jest.fn()}
        onOpenComments={jest.fn()}
      />,
    );

    expect(getByText('Circle video')).toBeTruthy();
    expect(getByText('Swipe down to close')).toBeTruthy();
    await fireEvent.press(getByLabelText('Mute Circle video'));

    expect(getByLabelText('Unmute Circle video')).toBeTruthy();
  });

  it('dismisses a direct Circle video after a downward swipe', async () => {
    const { Animated } = require('react-native');
    const { State } = require('react-native-gesture-handler');
    const timingSpy = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (callback?: () => void) => callback?.(),
    }));
    const onClose = jest.fn();
    const videoItem = {
      ...editorialItem,
      id: 'pulse-video-swipe',
      imageUrl: null,
      mediaUrl: 'https://example.com/guide.mp4',
      mediaType: 'video',
    };
    const { getByLabelText } = await render(
      <CirclePulseMediaViewer
        visible
        item={videoItem}
        onClose={onClose}
        onOpenComments={jest.fn()}
      />,
    );

    const gestureSurface = getByLabelText('Dismiss Circle video gesture');
    await act(() => {
      gestureSurface.props.onHandlerStateChange({
        nativeEvent: {
          oldState: State.ACTIVE,
          translationY: 140,
          velocityY: 900,
        },
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    timingSpy.mockRestore();
  });
});
