import { useCallback, useMemo, useState } from 'react';
import { Match } from '@/types/match';

// lightweight mock generator (expandable)
function createMockMatches(): Match[] {
  const now = Date.now();
  const threeHoursMs = 3 * 60 * 60 * 1000;
  return [
    {
      id: 'm-001',
      name: 'Sena',
      age: 29,
      tagline: 'Coffee + trails = perfect weekend',
      interests: ['Hiking', 'Coffee', 'Design'],
      avatar_url: 'https://images.unsplash.com/photo-1545996124-8e6f5b9e2f6d?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '1.2 km away',
      isActiveNow: false,
      lastActive: new Date(now - 30 * 60 * 1000).toISOString(), // 30m ago
      verified: true,
      personalityTags: ['Calm', 'Family Oriented', 'Goal Driven'],
      aiScore: 92,
    } as Match,
    {
      id: 'm-002',
      name: 'Daniel',
      age: 31,
      tagline: 'Weekend coder, weekday dad',
      interests: ['Technology', 'Cooking', 'Running'],
      avatar_url: 'https://images.unsplash.com/photo-1544005313-1d1d3a2b7f9a?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '6.8 km away',
      isActiveNow: true,
      lastActive: new Date(now - 2 * 60 * 1000).toISOString(), // 2m ago
      verified: false,
      personalityTags: ['Goal Driven', 'Adventurous'],
      aiScore: 87,
    } as Match,
    {
      id: 'm-003',
      name: 'Esi',
      age: 26,
      tagline: 'Painter, coffee snob, plant parent',
      interests: ['Art', 'Plants', 'Travel'],
      avatar_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '3.4 km away',
      isActiveNow: false,
      lastActive: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago (recent)
      verified: false,
      personalityTags: ['Creative', 'Curious', 'Calm'],
      aiScore: 78,
    } as Match,
    {
      id: 'm-004',
      name: 'Kofi',
      age: 28,
      tagline: 'Music producer & night market fan',
      interests: ['Music', 'Food', 'Photography'],
      avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '12.1 km away',
      isActiveNow: false,
      lastActive: new Date(now - (5 * 60 * 60 * 1000)).toISOString(), // 5 hours ago
      verified: true,
      personalityTags: ['Outgoing', 'Family Oriented'],
      aiScore: 65,
    } as Match,
    {
      id: 'm-005',
      name: 'Abena',
      age: 24,
      tagline: 'Bookshop evenings and plant swaps',
      interests: ['Books', 'Gardening', 'Design'],
      avatar_url: 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '9.9 km away',
      isActiveNow: false,
      lastActive: new Date(now - (20 * 60 * 60 * 1000)).toISOString(), // 20 hours ago
      verified: false,
      personalityTags: ['Thoughtful', 'Calm'],
      aiScore: 71,
    } as Match,
  ];
}
// helper to return mock matches with optional dev-only injections
function getDebugMockMatches(): Match[] {
  const list = createMockMatches();
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    try {
      if (list[0]) (list[0] as any).personalityTags = ['Calm', 'Family Oriented', 'Goal Driven'];
      if (list[1]) (list[1] as any).personalityTags = ['Adventurous', 'Curious'];
    } catch (e) {}
  }
  return list;
}

export default function useAIRecommendations(userId?: string) {
  const [matches, setMatches] = useState<Match[]>(() => getDebugMockMatches());
  const [lastMutualMatch, setLastMutualMatch] = useState<Match | null>(null);
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

    // Mock mutual-match detection: when user likes, randomly simulate a mutual like
    if (action === 'like') {
      const chance = Math.random();
      if (chance < 0.28) {
        // pick the current head as the matched person (if available)
        const matched = matches[0];
        if (matched) {
          setLastMutualMatch(matched);
          // clear after a short delay to avoid sticky UI in tests
          setTimeout(() => setLastMutualMatch(null), 10_000);
        }
      }
    }
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

  return { matches, recordSwipe, swipeHistory, undoLastSwipe, refreshMatches, smartCount, lastMutualMatch } as const;
}
