// @ts-nocheck
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.setTimeout(20000);

let mockParams: Record<string, any> = { id: 'circle-1' };
let mockProfile: any = { id: 'profile-me', city: 'London' };
let mockUser: any = { id: 'user-me' };
let mockPulseItems: any[] = [];
let mockFocusEffectCallbacks: (() => void | (() => void))[] = [];
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRpc = jest.fn();

const dataset = {
  circles: [
    {
      id: 'circle-1',
      name: 'Intentional Circle',
      description: 'Trusted space',
      short_description: 'Trusted space',
      visibility: 'public',
      created_by_profile_id: 'profile-owner',
      created_by_user_id: 'user-owner',
      circle_type: 'community',
      status: 'approved',
      visibility_scope: 'country',
      city: 'London',
      country_name: 'United Kingdom',
      is_official: false,
      is_partner: false,
      is_featured: false,
      requires_join_approval: false,
      rules: null,
      safety_note: null,
      member_count: 2,
      active_this_week_count: 1,
      gathering_count: 0,
      image_path: null,
      image_updated_at: null,
      cover_image_url: null,
      icon_url: null,
    },
  ],
  circle_members: [] as any[],
  circle_prompts: [] as any[],
  circle_prompt_responses: [] as any[],
  gatherings: [] as any[],
  circle_role_requests: [] as any[],
  circle_reports: [] as any[],
  relationship_gists: [] as any[],
  moments: [] as any[],
};

function mockCreateQuery(table: string) {
  const state: any = {
    table,
    filters: [] as { field: string; value: any }[],
    orFilters: [] as { field: string; value: any }[],
    limitValue: null as number | null,
  };

  const resolveRows = () => {
    let rows = [...(dataset[table] ?? [])];
    for (const filter of state.filters) {
      rows = rows.filter((row) => row[filter.field] === filter.value);
    }
    if (state.orFilters.length) {
      rows = rows.filter((row) =>
        state.orFilters.some((filter) => row[filter.field] === filter.value),
      );
    }
    if (typeof state.limitValue === 'number') {
      rows = rows.slice(0, state.limitValue);
    }
    return rows;
  };

  const builder: any = {
    select: () => builder,
    eq: (field: string, value: any) => {
      state.filters.push({ field, value });
      return builder;
    },
    or: (value: string) => {
      state.orFilters = String(value)
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => {
          const [field, operator, ...rest] = segment.split('.');
          return {
            field,
            operator,
            value: rest.join('.'),
          };
        })
        .filter((filter) => filter.field && filter.operator === 'eq' && filter.value !== '')
        .map(({ field, value }) => ({ field, value }));
      return builder;
    },
    in: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: (value: number) => {
      state.limitValue = value;
      return builder;
    },
    maybeSingle: async () => {
      const rows = resolveRows();
      return { data: rows[0] ?? null, error: null };
    },
    then: (resolve: any, reject: any) => Promise.resolve({ data: resolveRows(), error: null }).then(resolve, reject),
  };

  return builder;
}

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
    replace: (...args: any[]) => mockReplace(...args),
  },
  useFocusEffect: (callback: () => void) => {
    mockFocusEffectCallbacks.push(callback);
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    profile: mockProfile,
    user: mockUser,
  }),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'dark',
}));

jest.mock('@/lib/permission-prompts', () => ({
  showOpenSettingsPrompt: jest.fn(),
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@/lib/offline/circle-detail-store', () => ({
  readCircleDetailSnapshotState: jest.fn(async () => ({
    data: null,
    savedAt: null,
    isStale: false,
  })),
  writeCircleDetailSnapshot: jest.fn(async () => undefined),
}));

jest.mock('@/lib/circles/pulse/use-circle-pulse', () => ({
  useCirclePulse: () => ({
    items: mockPulseItems,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock('@/lib/circles/pulse/circle-pulse-service', () => ({
  endCircleLoveSeat: jest.fn(),
  fetchCirclePulseDiscussionReadStates: jest.fn(async () => []),
}));

jest.mock('@/components/IntentRequestSheet', () => () => null);

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text: MockText } = require('react-native');
  return {
    MaterialCommunityIcons: ({ name }: any) => React.createElement(MockText, null, name),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => mockCreateQuery(table)),
    rpc: (...args: any[]) => mockRpc(...args),
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: jest.fn(async () => ({ data: null, error: null })),
        upload: jest.fn(async () => ({ error: null })),
      })),
    },
  },
}));

const CircleDetailScreen = require('@/app/circles/[id]').default;

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

const renderFocusedScreen = async () => {
  const screen = render(<CircleDetailScreen />);
  await act(async () => {
    for (const callback of mockFocusEffectCallbacks) {
      callback();
    }
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
  });
  return screen;
};

describe('Circle detail role requests and role controls', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParams = { id: 'circle-1' };
    mockProfile = { id: 'profile-me', city: 'London' };
    mockUser = { id: 'user-me' };
    mockPulseItems = [];
    mockFocusEffectCallbacks = [];
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRpc.mockReset();
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'rpc_get_circle_member_moments') {
        return { data: dataset.moments, error: null };
      }
      if (name === 'rpc_list_circle_reports') {
        return { data: dataset.circle_reports, error: null };
      }
      return { error: null };
    });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    dataset.circle_members = [];
    dataset.circles[0].created_by_profile_id = 'profile-owner';
    dataset.circles[0].created_by_user_id = 'user-owner';
    dataset.circles[0].status = 'approved';
    dataset.circles[0].archived_at = null;
    dataset.circle_role_requests = [];
    dataset.circle_prompts = [];
    dataset.circle_prompt_responses = [];
    dataset.gatherings = [];
    dataset.circle_reports = [];
    dataset.relationship_gists = [];
    dataset.moments = [];
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('lets a member withdraw a pending moderator request', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
      {
        id: 'membership-other',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-other',
        user_id: 'user-other',
        profiles: { id: 'profile-other', full_name: 'Kojo', city: 'London', region: null, location: null, age: 31, avatar_url: null },
      },
    ];
    dataset.circle_role_requests = [
      {
        id: 'request-1',
        circle_id: 'circle-1',
        requester_profile_id: 'profile-me',
        requester_user_id: 'user-me',
        requested_role: 'moderator',
        note: 'I can help moderate.',
        status: 'pending',
        rejection_reason: null,
        created_at: '2026-05-30T10:00:00.000Z',
      },
    ];

    const { getByText, getAllByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByText('Help shape this Circle')).toBeTruthy());
    expect(getAllByText('Moderator pending').length).toBeGreaterThan(0);

    fireEvent.press(getByText('Withdraw request'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('rpc_cancel_circle_role_request', {
        p_request_id: 'request-1',
        p_profile_id: 'profile-me',
      });
    });
  });

  it('shows host role controls and lets a host approve a pending moderator request', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'host',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
      {
        id: 'membership-other',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-other',
        user_id: 'user-other',
        profiles: { id: 'profile-other', full_name: 'Kojo', city: 'London', region: null, location: null, age: 31, avatar_url: null },
      },
    ];
    dataset.circle_role_requests = [
      {
        id: 'request-2',
        circle_id: 'circle-1',
        requester_profile_id: 'profile-other',
        requester_user_id: 'user-other',
        requested_role: 'moderator',
        note: 'Happy to help with tone and safety.',
        status: 'pending',
        rejection_reason: null,
        created_at: '2026-05-30T10:00:00.000Z',
      },
    ];

    const { getByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByText('Role requests')).toBeTruthy());

    fireEvent.press(getByText('Approve'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('rpc_review_circle_role_request', {
        p_request_id: 'request-2',
        p_profile_id: 'profile-me',
        p_decision: 'approve',
        p_rejection_reason: null,
      });
    });
  });

  it('does not offer a redundant moderator request to an existing moderator', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'moderator',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
    ];

    const { getByText, queryByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByText('Rules and safety')).toBeTruthy());
    expect(queryByText('Request moderator')).toBeNull();
    expect(getByText('Request host')).toBeTruthy();
  });

  it('shows a complete in-app options sheet for a moderator', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'moderator',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
    ];

    const { getByLabelText, getByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByLabelText('Circle options')).toBeTruthy());
    fireEvent.press(getByLabelText('Circle options'));

    expect(getByText('Add host note')).toBeTruthy();
    expect(getByText('Leave Circle')).toBeTruthy();
    expect(getByText('Report Circle')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('lets a creator archive a live Circle from the options sheet', async () => {
    dataset.circles[0].created_by_profile_id = 'profile-me';
    dataset.circles[0].created_by_user_id = 'user-me';
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'host',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
    ];

    const { getByLabelText, getByText, queryByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByLabelText('Circle options')).toBeTruthy());
    fireEvent.press(getByLabelText('Circle options'));

    await waitFor(() => expect(getByText('Archive Circle')).toBeTruthy());
    expect(queryByText('Leave Circle')).toBeNull();
  });

  it('treats the creator as owner when only created_by_user_id and membership user_id match', async () => {
    mockProfile = null;
    dataset.circles[0].created_by_profile_id = 'profile-legacy-owner';
    dataset.circles[0].created_by_user_id = 'user-me';
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'host',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-legacy-owner',
        user_id: 'user-me',
        profiles: { id: 'profile-legacy-owner', user_id: 'user-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
      {
        id: 'membership-other',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-other',
        user_id: 'user-other',
        profiles: { id: 'profile-other', full_name: 'Kojo', city: 'London', region: null, location: null, age: 31, avatar_url: null },
      },
    ];

    const { getByLabelText, getByText, queryByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByText('Hosts and moderators')).toBeTruthy());

    fireEvent.press(getByLabelText('Circle options'));

    await waitFor(() => expect(getByText('Archive Circle')).toBeTruthy());
    expect(queryByText('Leave Circle')).toBeNull();
  });

  it.each(['host', 'admin'])('requires a %s to reassign stewardship before leaving', async (role) => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role,
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
    ];

    const { getByLabelText, getByText, queryByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByLabelText('Circle options')).toBeTruthy());
    fireEvent.press(getByLabelText('Circle options'));

    await waitFor(() => expect(getByText('Reassign your stewardship role before leaving this Circle.')).toBeTruthy());
    expect(queryByText('Leave Circle')).toBeNull();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('shows the moderation queue and lets a host resolve a report', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'host',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
    ];
    dataset.circle_reports = [
      {
        id: 'report-1',
        circle_id: 'circle-1',
        gathering_id: null,
        prompt_response_id: 'response-1',
        reporter_profile_id: 'profile-other',
        reason: 'Harassment',
        details: 'This felt inappropriate.',
        status: 'pending',
        created_at: '2026-05-31T10:00:00.000Z',
        gathering_title: null,
        prompt_response_text: 'A response that crossed the line.',
      },
    ];

    const { getByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByText('Moderation queue')).toBeTruthy());

    fireEvent.press(getByText('Resolve'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('rpc_review_circle_report', {
        p_report_id: 'report-1',
        p_profile_id: 'profile-me',
        p_status: 'resolved',
      });
    });
  });

  it('asks for confirmation before removing a prompt response from the prompt tab', async () => {
    mockParams = { id: 'circle-1', tab: 'prompts' };
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'host',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
      {
        id: 'membership-other',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-other',
        user_id: 'user-other',
        profiles: { id: 'profile-other', full_name: 'Kojo', city: 'London', region: null, location: null, age: 31, avatar_url: null },
      },
    ];
    dataset.circle_prompts = [
      {
        id: 'prompt-1',
        circle_id: 'circle-1',
        title: 'What does intentional dating mean to you?',
        prompt: 'Share what intentional dating looks like in practice.',
        prompt_type: 'weekly',
        status: 'published',
      },
    ];
    dataset.circle_prompt_responses = [
      {
        id: 'response-1',
        prompt_id: 'prompt-1',
        circle_id: 'circle-1',
        profile_id: 'profile-other',
        response: 'A response that needs moderation.',
        created_at: '2026-05-31T11:00:00.000Z',
        profiles: { id: 'profile-other', full_name: 'Kojo', city: 'London', region: null, location: null, age: 31, avatar_url: null },
      },
    ];

    const { findByText, getByText } = await renderFocusedScreen();

    await findByText('Questions that help members reveal values, intent, and emotional clarity.', {}, { timeout: 4000 });
    await findByText('What does intentional dating mean to you?', {}, { timeout: 4000 });
    await findByText('Remove response', {}, { timeout: 4000 });

    fireEvent.press(getByText('Remove response'));

    const alertCalls = alertSpy.mock.calls;
    const removeCall = alertCalls.find((call) => call[0] === 'Remove response');
    expect(removeCall).toBeTruthy();
    const buttons = removeCall?.[2] as { text?: string; onPress?: () => void }[] | undefined;
    const removeButton = buttons?.find((button) => button.text === 'Remove');
    expect(removeButton?.onPress).toBeTruthy();
  });

  it('preserves the Circle return target when opening a member profile', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
      {
        id: 'membership-other',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-other',
        user_id: 'user-other',
        joined_at: new Date().toISOString(),
        profiles: { id: 'profile-other', full_name: 'Kojo', city: 'London', region: null, location: null, age: 31, avatar_url: null },
      },
    ];

    const { getByLabelText, getAllByText, getByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByLabelText('Open Members tab')).toBeTruthy());

    fireEvent.press(getByLabelText('Open Members tab'));

    await waitFor(() => expect(getAllByText('View').length).toBeGreaterThan(1));
    expect(getByText('New')).toBeTruthy();

    fireEvent.press(getAllByText('View')[1]);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/profile-view',
      params: {
        profileId: 'profile-other',
        source: 'circle',
        returnCircleId: 'circle-1',
      },
    });
  });

  it('opens the exact featured Moment from the Circle Pulse Media spotlight', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
      {
        id: 'membership-other',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-other',
        user_id: 'user-other',
        profiles: { id: 'profile-other', full_name: 'Kojo', city: 'London', region: null, location: null, age: 31, avatar_url: null },
      },
    ];
    dataset.moments = [
      {
        id: 'moment-1',
        user_id: 'user-other',
        type: 'video',
        media_url: 'https://example.com/moment.mp4',
        thumbnail_url: 'https://example.com/moment-thumbnail.jpg',
        text_body: null,
        caption: 'An evening with the Circle.',
        created_at: '2026-06-01T17:00:00.000Z',
        expires_at: '2026-06-02T17:00:00.000Z',
        visibility: 'public',
        is_deleted: false,
      },
    ];
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'rpc_get_circle_member_moments') {
        return { data: dataset.moments, error: null };
      }
      if (name === 'rpc_list_circle_reports') {
        return { data: dataset.circle_reports, error: null };
      }
      return { error: null };
    });

    mockPulseItems = [
      {
        id: 'pulse-media',
        circleId: 'circle-1',
        type: 'media',
        title: 'An evening with the Circle',
        subtitle: 'From the Circle hosts',
        body: 'A quiet look at the community gathering.',
        imageUrl: 'https://example.com/moment-thumbnail.jpg',
        mediaUrl: 'https://example.com/moment.mp4',
        mediaType: 'video',
        momentId: 'moment-1',
        featuredProfileId: 'profile-other',
        featuredProfileName: 'Kojo',
        featuredProfileAge: 31,
        featuredProfileAvatarUrl: null,
        featuredProfileLocation: 'London',
        featuredProfileBadge: null,
        loveSeatQuote: null,
        welcomeProfiles: [],
        status: 'active',
        priority: 1,
        startsAt: null,
        expiresAt: null,
        commentCount: 0,
        discussionCta: null,
        discussionSummary: null,
        gatheringStartsAt: null,
        gatheringCity: null,
        gatheringType: null,
        gatheringPresentationMode: null,
        gatheringSeatContext: null,
        gatheringHostCreatedForMember: false,
        gatheringIsPartnerVenue: false,
        gatheringSafeFirstDateSpace: false,
        gatheringAttendeeCount: 0,
        sourceAvailable: true,
      },
    ];

    const { getAllByLabelText, getByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByText('Watch moment')).toBeTruthy());
    await waitFor(() => expect(getAllByLabelText('Open Circle media').length).toBeGreaterThan(1));

    fireEvent.press(getAllByLabelText('Open Circle media')[1]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/moments',
        params: {
          startUserId: 'user-other',
          startMomentId: 'moment-1',
          source: 'circles',
          entry: 'circles',
          circleId: 'circle-1',
          circleName: 'Intentional Circle',
        },
      });
    });
  });

  it('opens direct Circle Media in its editorial viewer instead of Moments', async () => {
    dataset.circle_members = [
      {
        id: 'membership-me',
        circle_id: 'circle-1',
        role: 'member',
        status: 'active',
        is_visible: true,
        profile_id: 'profile-me',
        user_id: 'user-me',
        profiles: { id: 'profile-me', full_name: 'Ada', city: 'London', region: null, location: null, age: 29, avatar_url: null },
      },
    ];
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'rpc_get_circle_member_moments') {
        return { data: dataset.moments, error: null };
      }
      if (name === 'rpc_list_circle_reports') {
        return { data: dataset.circle_reports, error: null };
      }
      return { error: null };
    });

    mockPulseItems = [
      {
        id: 'pulse-poster',
        circleId: 'circle-1',
        type: 'media',
        title: 'Sunday gathering poster',
        subtitle: 'Community notice',
        body: 'Doors open at six.',
        imageUrl: 'https://example.com/poster.jpg',
        mediaUrl: 'https://example.com/poster.jpg',
        mediaType: 'image',
        momentId: null,
        featuredProfileId: null,
        featuredProfileName: null,
        featuredProfileAge: null,
        featuredProfileAvatarUrl: null,
        featuredProfileLocation: null,
        featuredProfileBadge: null,
        loveSeatQuote: null,
        welcomeProfiles: [],
        status: 'active',
        priority: 1,
        startsAt: null,
        expiresAt: null,
        commentCount: 0,
        discussionCta: null,
        discussionSummary: null,
        gatheringStartsAt: null,
        gatheringCity: null,
        gatheringType: null,
        gatheringPresentationMode: null,
        gatheringSeatContext: null,
        gatheringHostCreatedForMember: false,
        gatheringIsPartnerVenue: false,
        gatheringSafeFirstDateSpace: false,
        gatheringAttendeeCount: 0,
        sourceAvailable: true,
      },
    ];

    const { getByLabelText, getByText } = await renderFocusedScreen();

    await waitFor(() => expect(getByText('View image')).toBeTruthy());

    fireEvent.press(getByText('View image'));

    expect(getByLabelText('Close Circle media')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/moments' }));
  });
});
