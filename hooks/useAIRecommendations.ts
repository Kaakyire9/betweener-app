import { useCallback, useMemo, useState } from 'react';
import { Match } from '@/types/match';

// lightweight mock generator (expandable)
function createMockMatches(): Match[] {
  return [
    {
      id: '1',
      name: 'Akosua',
      age: 24,
      tagline: 'Adventure seeker & foodie',
      interests: ['Travel', 'Food', 'Music'],
      avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face',
      distance: '2.3 km away',
      isActiveNow: false,
      verified: true,
    },
    {
      id: '2',
      name: 'Kwame',
      age: 27,
      tagline: 'Tech enthusiast & gym lover',
      interests: ['Technology', 'Fitness', 'Reading'],
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face',
      distance: '15.7 km away',
      isActiveNow: true,
      verified: false,
    },
    {
      id: '3',
      name: 'Ama',
      age: 22,
      tagline: 'Artist with a kind heart',
      interests: ['Art', 'Photography', 'Nature'],
      avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face',
      distance: '8.2 km away',
      isActiveNow: false,
      verified: false,
    },
  ];
}

export default function useAIRecommendations(userId?: string) {
  const [matches, setMatches] = useState<Match[]>(() => createMockMatches());
  const [swipeHistory, setSwipeHistory] = useState<Array<{ id: string; action: 'like' | 'dislike' | 'superlike'; index: number; match: Match }>>([]);

  // simple mock: when a swipe is recorded, remove the head and append a regenerated match
  const recordSwipe = useCallback((id: string, action: 'like' | 'dislike' | 'superlike', index = 0) => {
    setSwipeHistory((prev) => {
      const head = matches[0];
      if (!head) return prev;
      return [...prev, { id, action, index, match: head }];
    });
    setMatches((prev: Match[]) => {
      const next = prev.slice(1);
      // append a regenerated match to keep list length stable (mock behavior)
      const generated: Match = {
        id: String(Date.now()),
        name: `New-${Math.floor(Math.random() * 1000)}`,
        age: 20 + Math.floor(Math.random() * 12),
        interests: ['Music', 'Movies'],
        avatar_url: prev[0]?.avatar_url,
        distance: `${Math.floor(Math.random() * 30)} km away`,
      } as Match;
      return [...next, generated];
    });
  }, [matches]);

  const undoLastSwipe = useCallback((): { match: Match; index: number } | null => {
    let lastEntry: { id: string; action: 'like' | 'dislike' | 'superlike'; index: number; match: Match } | undefined;
    setSwipeHistory((prev) => {
      if (prev.length === 0) return prev;
      lastEntry = prev[prev.length - 1];
      return prev.slice(0, -1);
    });

    if (!lastEntry) return null;

    // re-insert the match at the front so it becomes the active card again
    // and remove the generated tail element that was appended when the swipe
    // was originally recorded — this keeps the matches array length stable
    setMatches((prev) => {
      if (prev.length === 0) return [lastEntry!.match];
      const withoutLast = prev.slice(0, -1);
      return [lastEntry!.match, ...withoutLast];
    });
    return { match: lastEntry.match, index: lastEntry.index };
  }, []);

  const smartCount = useMemo(() => {
    // pretend some are AI-curated
    return Math.max(0, Math.min(5, Math.floor(matches.length / 2)));
  }, [matches]);

  const fetchMatchesFromServer = useCallback(async () => {
    try {
      const res = await fetch('/api/refresh-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('network');
      const body = await res.json();
      if (Array.isArray(body.matches)) {
        setMatches(body.matches as Match[]);
        return;
      }
    } catch (e) {
      // fallback to mocks on any failure
    }
    setMatches(() => createMockMatches());
  }, [userId]);

  const refreshMatches = useCallback(() => {
    // fire-and-forget: try server, fallback to mock on error
    void fetchMatchesFromServer();
    setSwipeHistory(() => []);
  }, [fetchMatchesFromServer]);

  return { matches, recordSwipe, swipeHistory, undoLastSwipe, refreshMatches, smartCount } as const;
}
