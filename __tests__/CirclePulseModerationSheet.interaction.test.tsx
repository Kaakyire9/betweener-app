// @ts-nocheck
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CirclePulseModerationSheet from '@/components/circles/CirclePulseModerationSheet';

const mockFetchReports = jest.fn();
const mockReviewReport = jest.fn();

jest.mock('@/lib/circles/pulse/circle-pulse-service', () => ({
  fetchCirclePulseCommentReports: (...args: unknown[]) => mockFetchReports(...args),
  reviewCirclePulseCommentReport: (...args: unknown[]) => mockReviewReport(...args),
}));

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

const report = {
  commentId: 'comment-1',
  circleId: 'circle-1',
  itemId: 'pulse-1',
  itemType: 'prompt',
  itemTitle: 'First-date energy',
  commentProfileId: 'profile-2',
  commentAuthorName: 'Ama',
  commentBody: 'A comment that needs review.',
  reportCount: 2,
  latestReason: 'concern',
  latestReportAt: '2026-06-01T12:00:00.000Z',
  status: 'pending',
};

describe('CirclePulseModerationSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets a host remove a reported Pulse comment', async () => {
    mockFetchReports.mockResolvedValueOnce([report]).mockResolvedValueOnce([]);
    mockReviewReport.mockResolvedValueOnce(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onChanged = jest.fn();
    const { getByLabelText, getByText } = await render(
      <CirclePulseModerationSheet
        visible
        circleId="circle-1"
        actorProfileId="profile-1"
        onClose={jest.fn()}
        onChanged={onChanged}
      />,
    );

    await waitFor(() => expect(getByText('Ama')).toBeTruthy());
    await fireEvent.press(getByLabelText('Remove reported Pulse comment'));

    const actions = alertSpy.mock.calls[0][2];
    await act(async () => {
      actions.find((action: any) => action.text === 'Remove comment').onPress();
    });

    await waitFor(() => {
      expect(mockReviewReport).toHaveBeenCalledWith('comment-1', 'profile-1', 'remove');
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(getByText('No Pulse reports')).toBeTruthy();
    });

    alertSpy.mockRestore();
  }, 10000);
});
