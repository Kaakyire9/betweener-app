// @ts-nocheck
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import ChatMediaSafetyNotice, {
  CHAT_MEDIA_SAFETY_NOTICE_AUTO_DISMISS_MS,
} from '@/components/chat/ChatMediaSafetyNotice';
import { Colors } from '@/constants/theme';

jest.mock('@/lib/telemetry/sentry', () => ({ captureMessage: jest.fn() }));
jest.mock('@/lib/trust-links', () => ({
  TRUST_LINKS: { communityGuidelines: 'https://example.com/guidelines' },
  openExternalUrl: jest.fn(),
}));

const notice = {
  id: 'notice-1',
  ownerUserId: 'me',
  threadId: 'peer',
  localMessageId: 'temp-image-1',
  attachmentType: 'image',
  reasonCategory: 'MEDIA_POLICY_REJECTED',
  viewOnce: false,
  createdAt: Date.now(),
};

describe('ChatMediaSafetyNotice', () => {
  it('uses an eight-second default lifetime', () => {
    expect(CHAT_MEDIA_SAFETY_NOTICE_AUTO_DISMISS_MS).toBe(8_000);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows safe sender copy with no thumbnail or classifier details', async () => {
    const screen = await render(
      <ChatMediaSafetyNotice
        notice={notice}
        theme={Colors.dark}
        isDark
        onDismiss={jest.fn()}
        onChooseAnother={jest.fn()}
      />,
    );

    expect(screen.getByText('Photo not sent')).toBeTruthy();
    expect(screen.getByText('This photo doesn’t meet Betweener’s media guidelines.')).toBeTruthy();
    expect(screen.queryByLabelText('Open photo')).toBeNull();
    expect(screen.queryByText(/classifier|confidence|risk score|OpenAI/i)).toBeNull();
    screen.unmount();
  });

  it('opens the explanation sheet and offers the existing picker action', async () => {
    const onChooseAnother = jest.fn();
    const screen = await render(
      <ChatMediaSafetyNotice
        notice={notice}
        theme={Colors.light}
        isDark={false}
        onDismiss={jest.fn()}
        onChooseAnother={onChooseAnother}
      />,
    );

    fireEvent.press(screen.getByText('Learn why'));
    await waitFor(() => expect(screen.getByText('Why wasn’t my photo sent?')).toBeTruthy());
    expect(screen.getByText(/prohibited contact promotion/)).toBeTruthy();
    expect(screen.queryByText(/threshold|provider response|OCR|QR/i)).toBeNull();

    fireEvent.press(screen.getByText('Choose another photo'));
    await waitFor(() => expect(onChooseAnother).toHaveBeenCalledTimes(1));
    screen.unmount();
  });

  it('auto-dismisses after approximately eight seconds', async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <ChatMediaSafetyNotice
        notice={notice}
        theme={Colors.light}
        isDark={false}
        onDismiss={onDismiss}
        onChooseAnother={jest.fn()}
        autoDismissMs={10}
      />,
    );

    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('auto'));
    screen.unmount();
  });

  it('uses the animated continued path instead of disappearing abruptly', async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <ChatMediaSafetyNotice
        notice={notice}
        theme={Colors.dark}
        isDark
        onDismiss={onDismiss}
        onChooseAnother={jest.fn()}
        dismissWhenContinued
      />,
    );

    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('continued'));
    screen.unmount();
  });
});
