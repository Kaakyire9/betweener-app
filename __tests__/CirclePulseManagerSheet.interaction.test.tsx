// @ts-nocheck
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CirclePulseManagerSheet from '@/components/circles/CirclePulseManagerSheet';

const mockFeatureCirclePulseItem = jest.fn();
const mockCreateCirclePulseEditorialMedia = jest.fn();

jest.mock('@/lib/circles/pulse/circle-pulse-service', () => ({
  archiveCirclePulseItem: jest.fn(),
  cancelCircleLoveSeatNomination: jest.fn(),
  createCirclePulseEditorialMedia: (...args: any[]) => mockCreateCirclePulseEditorialMedia(...args),
  featureCirclePulseItem: (...args: any[]) => mockFeatureCirclePulseItem(...args),
  fetchCircleLoveSeatsForHost: jest.fn(async () => []),
  nominateCircleLoveSeat: jest.fn(),
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatureCirclePulseItem.mockResolvedValue({ id: 'pulse-media' });
    mockCreateCirclePulseEditorialMedia.mockResolvedValue({ id: 'pulse-editorial-media' });
  });

  it('keeps Circle Media visible when there are no member Moments', async () => {
    const { getByLabelText, getByText } = render(
      <CirclePulseManagerSheet
        {...defaultProps}
      />,
    );

    await waitFor(() => {
      expect(getByText('Circle Media')).toBeTruthy();
      expect(getByText('Add Circle media')).toBeTruthy();
    });

    fireEvent.press(getByText('Add Circle media'));

    expect(getByLabelText('Publish mocked Circle media')).toBeTruthy();
  });

  it('publishes host-curated Circle Media without creating a Moment', async () => {
    const onClose = jest.fn();
    const onFeatured = jest.fn();
    const { getByLabelText, getByText } = render(
      <CirclePulseManagerSheet
        {...defaultProps}
        onClose={onClose}
        onFeatured={onFeatured}
      />,
    );

    fireEvent.press(getByText('Add Circle media'));
    fireEvent.press(getByLabelText('Publish mocked Circle media'));

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
    const { getAllByText, getByText } = render(
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

    fireEvent.press(getByText('plus'));

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
});
