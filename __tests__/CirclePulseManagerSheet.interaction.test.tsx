// @ts-nocheck
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CirclePulseManagerSheet from '@/components/circles/CirclePulseManagerSheet';

const mockFeatureCirclePulseItem = jest.fn();
const mockCreateCirclePulseEditorialMedia = jest.fn();
const mockNominateCircleLoveSeat = jest.fn();
const mockEndCircleLoveSeat = jest.fn();
const mockFetchCircleLoveSeatsForHost = jest.fn();

jest.mock('@/lib/circles/pulse/circle-pulse-service', () => ({
  archiveCirclePulseItem: jest.fn(),
  cancelCircleLoveSeatNomination: jest.fn(),
  createCirclePulseEditorialMedia: (...args: any[]) => mockCreateCirclePulseEditorialMedia(...args),
  endCircleLoveSeat: (...args: any[]) => mockEndCircleLoveSeat(...args),
  featureCirclePulseItem: (...args: any[]) => mockFeatureCirclePulseItem(...args),
  fetchCircleLoveSeatsForHost: (...args: any[]) => mockFetchCircleLoveSeatsForHost(...args),
  nominateCircleLoveSeat: (...args: any[]) => mockNominateCircleLoveSeat(...args),
  reorderCirclePulseItems: jest.fn(),
}));

jest.mock('@/components/circles/CirclePulseMediaComposer', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return function MockCirclePulseMediaComposer({ onPublish }: any) {
    return React.createElement(
      Pressable,
      {
        accessibilityLabel: 'Publish mocked Circle media',
        onPress: () => onPublish({
          uri: 'file:///poster.jpg',
          mediaType: 'image',
          title: 'Gathering poster',
          subtitle: 'Sunday in Accra',
          body: 'A calm evening for members.',
        }),
      },
      React.createElement(Text, null, 'Mock media composer'),
    );
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    MaterialCommunityIcons: ({ name }: any) => React.createElement(Text, null, name),
  };
});

const defaultProps = {
  visible: true,
  circleId: 'circle-1',
  actorProfileId: 'profile-1',
  prompts: [],
  gatherings: [],
  media: [],
  featuredItems: [],
  loveSeatCandidates: [],
  onClose: jest.fn(),
  onFeatured: jest.fn(),
};

describe('CirclePulseManagerSheet', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatureCirclePulseItem.mockResolvedValue({ id: 'pulse-media' });
    mockCreateCirclePulseEditorialMedia.mockResolvedValue({ id: 'pulse-editorial-media' });
    mockNominateCircleLoveSeat.mockResolvedValue({ id: 'love-seat-1' });
    mockEndCircleLoveSeat.mockResolvedValue(true);
    mockFetchCircleLoveSeatsForHost.mockResolvedValue([]);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('keeps Circle Media visible when there are no member Moments', async () => {
    const { getByLabelText, getByText } = await render(
      <CirclePulseManagerSheet
        {...defaultProps}
      />,
    );

    await waitFor(() => {
      expect(getByText('Circle Media')).toBeTruthy();
      expect(getByText('Add Circle media')).toBeTruthy();
    });

    await fireEvent.press(getByText('Add Circle media'));

    expect(getByLabelText('Publish mocked Circle media')).toBeTruthy();
  });

  it('publishes host-curated Circle Media without creating a Moment', async () => {
    const onClose = jest.fn();
    const onFeatured = jest.fn();
    const { getByLabelText, getByText } = await render(
      <CirclePulseManagerSheet
        {...defaultProps}
        onClose={onClose}
        onFeatured={onFeatured}
      />,
    );

    await fireEvent.press(getByText('Add Circle media'));
    await fireEvent.press(getByLabelText('Publish mocked Circle media'));

    await waitFor(() => {
      expect(mockCreateCirclePulseEditorialMedia).toHaveBeenCalledWith('circle-1', 'profile-1', {
        uri: 'file:///poster.jpg',
        mediaType: 'image',
        title: 'Gathering poster',
        subtitle: 'Sunday in Accra',
        body: 'A calm evening for members.',
      });
      expect(onFeatured).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('features an eligible member Moment from its separate section', async () => {
    const onClose = jest.fn();
    const onFeatured = jest.fn();
    const { getAllByText, getByText } = await render(
      <CirclePulseManagerSheet
        {...defaultProps}
        media={[
          {
            id: 'moment-1',
            title: "Kojo's Moment",
            subtitle: 'A thoughtful gathering clip.',
            momentType: 'video',
            imageUrl: 'https://example.com/moment-thumbnail.jpg',
          },
        ]}
        onClose={onClose}
        onFeatured={onFeatured}
      />,
    );

    await waitFor(() => {
      expect(getByText('Circle Media')).toBeTruthy();
      expect(getByText('Member Moments')).toBeTruthy();
      expect(getAllByText('Moment')).toHaveLength(1);
      expect(getByText("Kojo's Moment")).toBeTruthy();
    });

    await fireEvent.press(getByText('plus'));

    await waitFor(() => {
      expect(mockFeatureCirclePulseItem).toHaveBeenCalledWith('circle-1', 'profile-1', {
        type: 'media',
        momentId: 'moment-1',
        title: "Kojo's Moment",
      });
      expect(onFeatured).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces the normalized Love Seat rejection reason from the service', async () => {
    mockNominateCircleLoveSeat.mockRejectedValue(
      new Error('This Circle already has an open Love Seat invitation or active Love Seat.'),
    );

    const { getByText } = await render(
      <CirclePulseManagerSheet
        {...defaultProps}
        loveSeatCandidates={[
          {
            profileId: 'profile-2',
            name: 'Akosua',
            age: 28,
            avatarUrl: null,
            location: 'Accra, Ghana',
          },
        ]}
      />,
    );

    await fireEvent.press(getByText('plus'));
    await fireEvent.press(getByText('Send invitation'));

    await waitFor(() => {
      expect(mockNominateCircleLoveSeat).toHaveBeenCalledWith(
        'circle-1',
        'profile-1',
        'profile-2',
        '',
      );
      expect(alertSpy).toHaveBeenCalledWith(
        'Love Seat',
        'This Circle already has an open Love Seat invitation or active Love Seat.',
      );
    });
  });

  it('shows an actionable fallback when an active Love Seat is no longer visible on Pulse', async () => {
    mockFetchCircleLoveSeatsForHost.mockResolvedValue([
      {
        id: 'love-seat-active-1',
        circleId: 'circle-1',
        featuredProfileId: 'profile-2',
        featuredProfileName: 'Akosua',
        featuredProfileAvatarUrl: null,
        quote: 'A thoughtful connection.',
        status: 'active',
        createdAt: '2026-07-22T10:00:00.000Z',
        respondedAt: '2026-07-22T10:05:00.000Z',
      },
    ]);

    const onFeatured = jest.fn();
    const { getByText } = await render(
      <CirclePulseManagerSheet
        {...defaultProps}
        onFeatured={onFeatured}
      />,
    );

    await waitFor(() => {
      expect(getByText('Active Love Seat')).toBeTruthy();
      expect(getByText('Akosua')).toBeTruthy();
      expect(getByText('End Love Seat')).toBeTruthy();
    });

    await fireEvent.press(getByText('End Love Seat'));

    await waitFor(() => {
      expect(mockEndCircleLoveSeat).toHaveBeenCalledWith('love-seat-active-1', 'profile-1');
      expect(onFeatured).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith(
        'Love Seat ended',
        'This stale Love Seat has been cleared so you can nominate someone new.',
      );
    });
  });
});
