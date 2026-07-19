// @ts-nocheck
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CirclePulseMediaComposer from '@/components/circles/CirclePulseMediaComposer';

const mockRequestMediaLibraryPermissionsAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: any[]) => mockRequestMediaLibraryPermissionsAsync(...args),
  launchImageLibraryAsync: (...args: any[]) => mockLaunchImageLibraryAsync(...args),
  UIImagePickerControllerQualityType: { Medium: 'medium' },
  VideoExportPreset: { H264_1280x720: 'h264-1280x720' },
}));

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: any) => React.createElement(View, props),
  };
});

jest.mock('@/lib/permission-prompts', () => ({
  showOpenSettingsPrompt: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    MaterialCommunityIcons: ({ name }: any) => React.createElement(Text, null, name),
  };
});

describe('CirclePulseMediaComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///poster.jpg' }],
    });
  });

  it('publishes a curated image with editorial copy', async () => {
    const onPublish = jest.fn();
    const { getByPlaceholderText, getByText } = await render(
      <CirclePulseMediaComposer saving={false} onCancel={jest.fn()} onPublish={onPublish} />,
    );

    await fireEvent.press(getByText('Choose image'));
    await waitFor(() => expect(getByText('Circle image')).toBeTruthy());
    await fireEvent.changeText(getByPlaceholderText('Headline'), 'Gathering poster');
    await fireEvent.changeText(getByPlaceholderText('Optional context'), 'Sunday in Accra');
    await fireEvent.changeText(getByPlaceholderText('Optional note for members'), 'Come ready for a calm evening.');
    await fireEvent.press(getByText('Publish media'));

    expect(onPublish).toHaveBeenCalledWith({
      uri: 'file:///poster.jpg',
      mediaType: 'image',
      title: 'Gathering poster',
      subtitle: 'Sunday in Accra',
      body: 'Come ready for a calm evening.',
    });
  });

  it('replaces the selected image when the host chooses a video', async () => {
    const onPublish = jest.fn();
    mockLaunchImageLibraryAsync
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///guide.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///guide.mp4' }] });
    const { getByPlaceholderText, getByText } = await render(
      <CirclePulseMediaComposer saving={false} onCancel={jest.fn()} onPublish={onPublish} />,
    );

    await fireEvent.press(getByText('Choose image'));
    await waitFor(() => expect(getByText('Circle image')).toBeTruthy());
    await fireEvent.press(getByText('Choose video'));
    await waitFor(() => expect(getByText('Short video')).toBeTruthy());
    await fireEvent.changeText(getByPlaceholderText('Headline'), 'First date guide');
    await fireEvent.press(getByText('Publish media'));

    expect(onPublish).toHaveBeenCalledWith({
      uri: 'file:///guide.mp4',
      mediaType: 'video',
      title: 'First date guide',
      subtitle: null,
      body: null,
    });
  });
});
