// @ts-nocheck
import React from 'react';
import ExploreCard from '@/components/ExploreCard';
// require at runtime to avoid TypeScript resolution of testing library types in this environment
// @ts-ignore
const { render } = require('@testing-library/react-native');

describe('ExploreCard personality pills', () => {
  it('renders up to 3 personality pills when personalityTags exist', () => {
    const match = {
      id: 't-1',
      name: 'Test User',
      age: 30,
      tagline: 'Tester',
      interests: ['Testing'],
      avatar_url: 'https://example.com/avatar.jpg',
      distance: '0.5 km away',
      isActiveNow: false,
      verified: false,
      personalityTags: ['Calm', 'Family Oriented', 'Goal Driven'],
      aiScore: 88,
    } as any;

    const { getByText } = render(<ExploreCard match={match} />);

    // Expect each personality tag to render as a pill
    expect(getByText('Calm')).toBeTruthy();
    expect(getByText('Family Oriented')).toBeTruthy();
    expect(getByText('Goal Driven')).toBeTruthy();
  });
});
