import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: ReactNode }) => <>{children}</> }));

const props = () => ({
  styles: {}, theme: { background: '#fff', backgroundSubtle: '#eee', text: '#000', tint: '#123456', accent: '#654321' },
  isDark: false, withAlpha: (hex: string) => hex, searchQuery: '',
  onExplore: jest.fn(), onClearSearch: jest.fn(), onShowAll: jest.fn(),
});

describe('inbox empty state recovery', () => {
  it.each(['all', 'unread', 'pinned', 'archived'] as const)('offers search recovery in %s without onboarding advice', async activeTab => {
    const actions = props();
    const view = await render(<ChatEmptyState {...actions} activeTab={activeTab} searchQuery="  missing  " />);
    expect(view.getByRole('header', { name: 'No matching conversations' })).toBeTruthy();
    expect(view.queryByText('A thoughtful hello starts here.')).toBeNull();
    expect(view.queryByText('Explore Vibes')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Clear search' }));
    expect(actions.onClearSearch).toHaveBeenCalledTimes(1);
    expect(actions.onExplore).not.toHaveBeenCalled();
    expect(actions.onShowAll).not.toHaveBeenCalled();
  });

  it.each([
    ['unread', "You're all caught up"],
    ['pinned', 'No pinned chats yet'],
    ['archived', 'No archived chats yet'],
  ] as const)('offers All as recovery from an empty %s view', async (activeTab, title) => {
    const actions = props();
    const view = await render(<ChatEmptyState {...actions} activeTab={activeTab} />);
    expect(view.getByText(title)).toBeTruthy();
    expect(view.queryByText('Better first messages')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Show all chats' }));
    expect(actions.onShowAll).toHaveBeenCalledTimes(1);
    expect(actions.onClearSearch).not.toHaveBeenCalled();
  });

  it('keeps the first-conversation experience for an empty All view', async () => {
    const actions = props();
    const view = await render(<ChatEmptyState {...actions} activeTab="all" searchQuery="   " />);
    expect(view.getByText('No conversations yet, but the room is ready')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Explore Vibes' }));
    expect(actions.onExplore).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Clear search')).toBeNull();
  });
});
