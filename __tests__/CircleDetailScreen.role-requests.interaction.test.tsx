// @ts-nocheck
import React from 'react';
import { Alert, View, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.setTimeout(20000);

let mockParams: Record<string, any> = { id: 'circle-1' };
let mockProfile: any = { id: 'profile-me', city: 'London' };
let mockUser: any = { id: 'user-me' };
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
    filters: [] as Array<{ field: string; value: any }>,
    limitValue: null as number | null,
  };

  const resolveRows = () => {
    let rows = [...(dataset[table] ?? [])];
    for (const filter of state.filters) {
      rows = rows.filter((row) => row[filter.field] === filter.value);
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
    const React = require('react');
    React.useEffect(callback, [callback]);
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

import CircleDetailScreen from '@/app/circles/[id]';

describe('Circle detail role requests and role controls', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParams = { id: 'circle-1' };
    mockProfile = { id: 'profile-me', city: 'London' };
    mockUser = { id: 'user-me' };
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

    const { getByText, getAllByText } = render(<CircleDetailScreen />);

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

    const { getByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByText('Members (2)')).toBeTruthy());

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

  it('only offers host progression to an existing moderator', async () => {
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

    const { getByText, queryByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByText('Help shape this Circle')).toBeTruthy());
    expect(getByText('Request host')).toBeTruthy();
    expect(queryByText('Request moderator')).toBeNull();
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

    const { getByLabelText, getByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByLabelText('Circle options')).toBeTruthy());
    fireEvent.press(getByLabelText('Circle options'));

    expect(getByText('Add host note')).toBeTruthy();
    expect(getByText('Leave Circle')).toBeTruthy();
    expect(getByText('Report Circle')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('lets a creator archive a live Circle from the options sheet', async () => {
    dataset.circles[0].created_by_profile_id = 'profile-me';

    const { getByLabelText, getByText, queryByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByLabelText('Circle options')).toBeTruthy());
    fireEvent.press(getByLabelText('Circle options'));

    expect(getByText('Archive Circle')).toBeTruthy();
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

    const { getByLabelText, getByText, queryByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByLabelText('Circle options')).toBeTruthy());
    fireEvent.press(getByLabelText('Circle options'));

    expect(getByText('Reassign your stewardship role before leaving this Circle.')).toBeTruthy();
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

    const { getByText } = render(<CircleDetailScreen />);

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

  it('lets a host remove a prompt response from the prompt tab', async () => {
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

    const { getByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByText('Prompts (1)')).toBeTruthy());

    fireEvent.press(getByText('Prompts (1)'));

    await waitFor(() => expect(getByText('Remove response')).toBeTruthy());

    fireEvent.press(getByText('Remove response'));

    const alertCalls = alertSpy.mock.calls;
    const removeCall = alertCalls.find((call) => call[0] === 'Remove response');
    expect(removeCall).toBeTruthy();
    const buttons = removeCall?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
    const removeButton = buttons?.find((button) => button.text === 'Remove');
    expect(removeButton?.onPress).toBeTruthy();
    await act(async () => {
      await removeButton?.onPress?.();
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('rpc_remove_circle_prompt_response', {
        p_response_id: 'response-1',
        p_profile_id: 'profile-me',
      });
    });
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

    const { getAllByText, getByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByText('Members (2)')).toBeTruthy());

    fireEvent.press(getByText('Members (2)'));

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
      if (name === 'rpc_get_circle_pulse_items') {
        return {
          data: [
            {
              id: 'pulse-media',
              circle_id: 'circle-1',
              item_type: 'media',
              title: 'An evening with the Circle',
              subtitle: 'From the Circle hosts',
              body: 'A quiet look at the community gathering.',
              image_url: 'https://example.com/moment-thumbnail.jpg',
              media_url: 'https://example.com/moment.mp4',
              media_type: 'video',
              moment_id: 'moment-1',
              status: 'active',
              priority: 1,
              comment_count: 0,
              source_available: true,
            },
          ],
          error: null,
        };
      }
      if (name === 'rpc_list_circle_reports') {
        return { data: dataset.circle_reports, error: null };
      }
      return { error: null };
    });

    const { getByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByText('Watch moment')).toBeTruthy());

    fireEvent.press(getByText('Watch moment'));

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
      if (name === 'rpc_get_circle_pulse_items') {
        return {
          data: [
            {
              id: 'pulse-poster',
              circle_id: 'circle-1',
              item_type: 'media',
              title: 'Sunday gathering poster',
              subtitle: 'Community notice',
              body: 'Doors open at six.',
              image_url: 'https://example.com/poster.jpg',
              media_url: 'https://example.com/poster.jpg',
              media_type: 'image',
              moment_id: null,
              status: 'active',
              priority: 1,
              comment_count: 0,
              source_available: true,
            },
          ],
          error: null,
        };
      }
      if (name === 'rpc_list_circle_reports') {
        return { data: dataset.circle_reports, error: null };
      }
      return { error: null };
    });

    const { getByLabelText, getByText } = render(<CircleDetailScreen />);

    await waitFor(() => expect(getByText('View image')).toBeTruthy());

    fireEvent.press(getByText('View image'));

    expect(getByLabelText('Close Circle media')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/moments' }));
  });
});
