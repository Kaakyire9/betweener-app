import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { ChatListHeader } from '@/components/chat/ChatListHeader';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

function SearchHeader() {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  return <ChatListHeader
    showSearch={showSearch}
    searchQuery={searchQuery}
    onToggleSearch={() => setShowSearch(value => !value)}
    onChangeSearchQuery={setSearchQuery}
    onClearSearch={() => setSearchQuery('')}
    activeTab="all"
    onChangeTab={() => {}}
    unreadConversationCount={0}
    archivedConversationCount={0}
    styles={{}}
    theme={{ tint: '#008888', textMuted: '#888888' }}
  />;
}

describe('conversation search input lifecycle', () => {
  it('mounts a focusable input when opened and preserves the query when reopened', async () => {
    const view = await render(<SearchHeader />);
    expect(view.queryByPlaceholderText('Search conversations...')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Search conversations' }));
    const input = view.getByPlaceholderText('Search conversations...');
    expect(input.props.autoFocus).toBe(true);
    await fireEvent.changeText(input, ' Dufie ');
    await fireEvent.press(view.getByRole('button', { name: 'Close conversation search' }));
    expect(view.queryByPlaceholderText('Search conversations...')).toBeNull();
    expect(view.getByText('Dufie')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Show conversation search' }));
    expect(view.getByPlaceholderText('Search conversations...').props.value).toBe(' Dufie ');
    expect(view.getByPlaceholderText('Search conversations...').props.autoFocus).toBe(true);
  });

  it('clears a query without closing the active input', async () => {
    const view = await render(<SearchHeader />);
    await fireEvent.press(view.getByRole('button', { name: 'Search conversations' }));
    await fireEvent.changeText(view.getByPlaceholderText('Search conversations...'), 'missing');
    await fireEvent.press(view.getByRole('button', { name: 'Clear conversation search' }));
    expect(view.getByPlaceholderText('Search conversations...').props.value).toBe('');
    expect(view.queryByRole('button', { name: 'Clear conversation search' })).toBeNull();
    expect(view.getByRole('button', { name: 'Close conversation search' })).toBeTruthy();
  });
});
