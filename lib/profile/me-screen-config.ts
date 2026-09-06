import { Colors } from "@/constants/theme";

export const ACCOUNT_RECOVERY_METHOD_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'google', label: 'Google' },
  { value: 'apple', label: 'Apple' },
  { value: 'magic_link', label: 'Magic link' },
  { value: 'other', label: 'Other' },
] as const;

export const RECOVERY_PROVIDER_LABELS: Record<string, string> = {
  email: 'Email',
  google: 'Google',
  apple: 'Apple',
  password_backup: 'Password backup',
};

export const RECOVERY_PROVIDER_ICONS: Record<string, string> = {
  email: 'email-outline',
  google: 'google',
  apple: 'apple',
  password_backup: 'form-textbox-password',
};

export type DistanceUnit = 'auto' | 'km' | 'mi';

export const GIFT_SYSTEM_ENTITY_TYPES: string[] = ['profile_gift_revealed', 'profile_gift_archived'];

export const DISTANCE_UNIT_OPTIONS: {
  value: DistanceUnit;
  label: string;
  subtitle?: string;
}[] = [
  { value: 'auto', label: 'Auto', subtitle: 'Recommended' },
  { value: 'km', label: 'Kilometers' },
  { value: 'mi', label: 'Miles' },
];

export const QUIET_HOURS_PRESETS = [
  { id: 'late', label: '22:00-08:00', start: '22:00:00', end: '08:00:00' },
  { id: 'night', label: '23:00-07:00', start: '23:00:00', end: '07:00:00' },
  { id: 'deep', label: '00:00-06:00', start: '00:00:00', end: '06:00:00' },
] as const;

export const NOTIFICATION_CORE_OPTIONS = [
  { key: 'messages', label: 'Messages', body: 'Keep the main connection thread alive.', icon: 'message-text-outline' },
  { key: 'message_reactions', label: 'Message reactions', body: 'See the small signals inside chat.', icon: 'sticker-emoji' },
  { key: 'reactions', label: 'Reactions', body: 'Catch quick responses across the app.', icon: 'heart-outline' },
  { key: 'likes', label: 'Likes', body: 'Know when interest lands on your profile.', icon: 'cards-heart-outline' },
  { key: 'superlikes', label: 'Signals', body: 'Know when someone noticed something specific.', icon: 'broadcast' },
  { key: 'matches', label: 'Matches', body: 'Do not miss a fresh mutual opening.', icon: 'account-heart-outline' },
] as const;

export const NOTIFICATION_CONTROL_OPTIONS = [
  { key: 'push_enabled', label: 'Push notifications', body: 'Allow Betweener to reach you outside the app.', icon: 'bell-ring-outline' },
  { key: 'inapp_enabled', label: 'In-app notifications', body: 'Keep activity visible while you are inside.', icon: 'gesture-tap-button' },
  { key: 'preview_text', label: 'Preview message text', body: 'Show message content directly in alerts.', icon: 'text-box-search-outline' },
] as const;

export const NOTIFICATION_OPTIONAL_OPTIONS = [
  { key: 'profile_interest', label: 'Profile interest', body: 'Control who can surface curiosity, revisits, and saves around your profile.', icon: 'account-search-outline' },
  { key: 'moments', label: 'Moments', body: 'Stay close to comments and reactions on your posts.', icon: 'image-multiple-outline' },
  { key: 'verification', label: 'Verification updates', body: 'Get trust and review progress privately.', icon: 'shield-check-outline' },
  { key: 'announcements', label: 'Announcements', body: 'Hear about meaningful product changes and releases.', icon: 'bullhorn-outline' },
] as const;

export type SettingsMenuItem = {
  id: string;
  title?: string;
  icon?: string;
  color?: string;
  adminOnly?: boolean;
  type?: 'divider';
};

export const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  {
    id: 'appearance',
    title: 'Appearance',
    icon: 'theme-light-dark',
    color: Colors.light.tint,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: 'bell',
    color: Colors.light.tint,
  },
  {
    id: 'email',
    title: 'Email & Account',
    icon: 'email-outline',
    color: Colors.light.tint,
  },
  {
    id: 'handle',
    title: 'Betweener Handle',
    icon: 'at',
    color: Colors.light.tint,
  },
  {
    id: 'privacy',
    title: 'Privacy & Safety',
    icon: 'shield-check',
    color: Colors.light.tint,
  },
  {
    id: 'preferences',
    title: 'Relationship Compass',
    icon: 'compass-outline',
    color: Colors.light.tint,
  },
  {
    id: 'premium',
    title: 'Premium Plans',
    icon: 'crown-outline',
    color: '#D4A017',
  },
  {
    id: 'help',
    title: 'Help & Support',
    icon: 'help-circle',
    color: Colors.light.tint,
  },
  {
    id: 'admin',
    title: 'Admin Dashboard',
    icon: 'shield-account',
    color: '#FF9800',
    adminOnly: true,
  },
  {
    id: 'divider',
    type: 'divider',
  },
  {
    id: 'logout',
    title: 'Sign Out',
    icon: 'logout',
    color: '#ef4444',
  },
];

export const PROFILE_PROMPTS = [
  {
    id: 'two_truths_lie',
    title: 'Two truths and a lie',
    responses: [
      'I speak three languages',
      'I once met a celebrity',
      'I can cook jollof rice perfectly',
    ],
  },
  {
    id: 'week_goal',
    title: 'This week I want to...',
    responses: [
      'Try a new restaurant',
      'Learn something new',
      'Connect with old friends',
    ],
  },
] as const;

export const ACCOUNT_DELETION_REASON_OPTIONS = [
  {
    value: 'not_enough_matches',
    section: 'Product fit',
    label: 'Not enough quality matches',
    description: 'You are not seeing the kind of people or chemistry you hoped for.',
  },
  {
    value: 'not_feeling_safe',
    section: 'Trust & safety',
    label: 'I do not feel safe',
    description: 'Trust, moderation, or comfort has not felt strong enough.',
  },
  {
    value: 'taking_a_break',
    section: 'Product fit',
    label: 'I am taking a break',
    description: 'You want time away from dating or social discovery for now.',
  },
  {
    value: 'met_someone',
    section: 'Product fit',
    label: 'I met someone',
    description: 'You no longer need Betweener at the moment.',
  },
  {
    value: 'too_many_notifications',
    section: 'Product fit',
    label: 'Too many notifications',
    description: 'The app feels too noisy or demanding.',
  },
  {
    value: 'too_expensive',
    section: 'Product fit',
    label: 'It feels too expensive',
    description: 'Premium value does not feel worth the cost right now.',
  },
  {
    value: 'technical_issues',
    section: 'Product fit',
    label: 'Technical issues',
    description: 'Bugs, speed, or reliability are getting in the way.',
  },
  {
    value: 'privacy_concerns',
    section: 'Trust & safety',
    label: 'Privacy concerns',
    description: 'You are not comfortable with how your data or profile is handled.',
  },
  {
    value: 'not_for_me',
    section: 'Product fit',
    label: 'Betweener is not for me',
    description: 'The product or experience is not the right fit.',
  },
  {
    value: 'other',
    section: 'Other',
    label: 'Other',
    description: 'Something else is making you leave.',
  },
] as const;

export type DeleteReasonOption = (typeof ACCOUNT_DELETION_REASON_OPTIONS)[number];
export type DeleteReasonKey = DeleteReasonOption['value'];
export type DeleteAlternativeAction = 'take_break' | 'quiet_notifications' | 'hide_profile';

export const DELETE_SOFT_OFFRAMP_OPTIONS: {
  id: DeleteAlternativeAction;
  title: string;
  description: string;
}[] = [
  {
    id: 'take_break',
    title: 'Take a break',
    description: 'Hide your profile and quiet the app for now.',
  },
  {
    id: 'quiet_notifications',
    title: 'Reduce notifications',
    description: 'Keep your account, but make Betweener quieter.',
  },
  {
    id: 'hide_profile',
    title: 'Hide my profile',
    description: 'Step out of discovery without closing your account.',
  },
];

export const DELETE_REASON_PRIORITY: DeleteReasonKey[] = [
  'not_feeling_safe',
  'privacy_concerns',
  'taking_a_break',
  'too_many_notifications',
  'met_someone',
  'not_enough_matches',
  'technical_issues',
  'too_expensive',
  'not_for_me',
  'other',
];

export const DELETE_REASON_SUGGESTIONS: Partial<
  Record<
    DeleteReasonKey,
    {
      title: string;
      description: string;
      cta: string;
      action: DeleteAlternativeAction;
    }
  >
> = {
  not_feeling_safe: {
    title: 'Hide your profile right away',
    description: 'Step out of discovery first, then decide later if full deletion is still right.',
    cta: 'Hide profile now',
    action: 'hide_profile',
  },
  privacy_concerns: {
    title: 'Step back without disappearing fully',
    description: 'Hide your profile now and keep the option to return with more control.',
    cta: 'Hide profile now',
    action: 'hide_profile',
  },
  taking_a_break: {
    title: 'Take a quieter break instead',
    description: 'Pause your visibility and soften the noise without closing the door completely.',
    cta: 'Take a break instead',
    action: 'take_break',
  },
  too_many_notifications: {
    title: 'Keep your account, lose the noise',
    description: 'Quiet the app first. You may not need to leave entirely.',
    cta: 'Reduce notifications',
    action: 'quiet_notifications',
  },
  met_someone: {
    title: 'Keep the door open',
    description: 'Step back gracefully for now without permanently deleting your Betweener account.',
    cta: 'Take a break instead',
    action: 'take_break',
  },
  not_enough_matches: {
    title: 'Pause visibility while you reset',
    description: 'Hide your profile for now and return when you want fresher momentum.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  technical_issues: {
    title: 'Step back while issues settle',
    description: 'Hide your profile for now instead of closing your account for good.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  too_expensive: {
    title: 'Keep your place without staying visible',
    description: 'Hide your profile first so you can come back later without starting over.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  not_for_me: {
    title: 'Step back before you decide',
    description: 'Hide your profile for now and leave the door open while you think it through.',
    cta: 'Hide profile instead',
    action: 'hide_profile',
  },
  other: {
    title: 'A calmer off-ramp exists',
    description: 'If you just need distance, you can step back without fully closing your account.',
    cta: 'Take a break instead',
    action: 'take_break',
  },
};
