import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';

export type StudioModuleId = 'live' | 'circles' | 'gatherings' | 'relationship-gists';

export type StudioModule = {
  id: StudioModuleId;
  title: string;
  detail: string;
  actionLabel: string;
  manageLabel: string;
  actionHref: Href;
  manageHref: Href;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  tone: 'teal' | 'violet' | 'gold' | 'rose';
};

export const STUDIO_MODULES: StudioModule[] = [
  {
    id: 'live',
    title: 'Live',
    detail: 'Schedule a room, prepare the experience, and manage upcoming sessions.',
    actionLabel: 'Schedule Live',
    manageLabel: 'Host dashboard',
    actionHref: '/live/schedule',
    manageHref: '/live',
    icon: 'broadcast',
    tone: 'rose',
  },
  {
    id: 'circles',
    title: 'Circles',
    detail: 'Create trusted spaces and follow each submission through review.',
    actionLabel: 'Create Circle',
    manageLabel: 'Manage Circles',
    actionHref: '/circles/manage?create=circle',
    manageHref: '/circles/manage',
    icon: 'account-group-outline',
    tone: 'teal',
  },
  {
    id: 'gatherings',
    title: 'Gatherings',
    detail: 'Plan in-person, online, or hybrid experiences for the community.',
    actionLabel: 'Create Gathering',
    manageLabel: 'Manage Gatherings',
    actionHref: '/circles/manage?create=gathering',
    manageHref: '/circles/manage',
    icon: 'calendar-heart',
    tone: 'gold',
  },
  {
    id: 'relationship-gists',
    title: 'Relationship Gists',
    detail: 'Create, review, schedule, and publish with the AI Editorial Studio.',
    actionLabel: 'Create Gist',
    manageLabel: 'Open Editorial Studio',
    actionHref: '/admin-editorial',
    manageHref: '/admin-editorial',
    icon: 'book-edit-outline',
    tone: 'violet',
  },
];
