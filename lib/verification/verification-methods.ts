export type VerificationSubmissionType =
  | 'passport'
  | 'residence'
  | 'social'
  | 'workplace'
  | 'selfie_liveness';

export type VerificationMethodId = VerificationSubmissionType | 'ghana_card';

export type VerificationMethod = {
  id: VerificationMethodId;
  submissionType?: VerificationSubmissionType;
  title: string;
  description: string;
  level: number;
  icon: string;
  color: string;
  capture: 'library' | 'camera';
  mediaType: 'image' | 'video';
  submitLabel: string;
  category: 'fast' | 'document';
  helperLabel: string;
  reviewLabel: string;
  isRecommended?: boolean;
  challengeType?: string;
};

export const getVerificationSubmissionType = (
  method: VerificationMethod,
): VerificationSubmissionType => {
  if (method.id === 'ghana_card') return 'passport';
  return method.submissionType ?? method.id;
};

export const buildVerificationMethods = (includeGhanaCard: boolean): VerificationMethod[] => [
  ...(includeGhanaCard
    ? [
        {
          id: 'ghana_card' as const,
          submissionType: 'passport' as const,
          title: 'Ghana Card',
          description: 'Upload a clear image or PDF of your valid Ghana Card',
          level: 2,
          icon: 'card-outline',
          color: '#C99A2E',
          capture: 'library' as const,
          mediaType: 'image' as const,
          submitLabel: 'Upload Ghana Card',
          category: 'document' as const,
          helperLabel: 'Official Ghana identity proof',
          reviewLabel: 'Secure manual review',
        },
      ]
    : []),
  {
    id: 'passport',
    title: 'Passport / Visa',
    description: 'Upload a clear image or PDF of your passport or visa',
    level: 2,
    icon: 'document-text-outline',
    color: '#4CAF50',
    capture: 'library',
    mediaType: 'image',
    submitLabel: 'Upload Verification Document',
    category: 'document',
    helperLabel: 'Official travel identity proof',
    reviewLabel: 'Secure manual review',
  },
  {
    id: 'residence',
    title: 'Residence Proof',
    description: 'Utility bill, lease agreement, or bank statement',
    level: 2,
    icon: 'home-outline',
    color: '#2196F3',
    capture: 'library',
    mediaType: 'image',
    submitLabel: 'Upload Verification Document',
    category: 'document',
    helperLabel: 'Confirms the place you currently call home',
    reviewLabel: 'Secure manual review',
  },
  {
    id: 'social',
    title: 'Social Media',
    description: 'Share a public profile link or handle with consistent identity details',
    level: 1,
    icon: 'logo-instagram',
    color: '#E91E63',
    capture: 'library',
    mediaType: 'image',
    submitLabel: 'Submit Social Link',
    category: 'fast',
    helperLabel: 'Adds a lightweight linked-profile signal',
    reviewLabel: 'Manual review',
  },
  {
    id: 'workplace',
    title: 'Work / Study Proof',
    description: 'Employment letter or student ID from abroad',
    level: 2,
    icon: 'briefcase-outline',
    color: '#FF9800',
    capture: 'library',
    mediaType: 'image',
    submitLabel: 'Upload Verification Document',
    category: 'document',
    helperLabel: 'Strong proof for relocation or study abroad',
    reviewLabel: 'Secure manual review',
  },
  {
    id: 'selfie_liveness',
    title: 'Selfie Liveness',
    description: 'Record a short guided selfie video so Betweener can confirm it is really you',
    level: 2,
    icon: 'scan-circle-outline',
    color: '#7C4DFF',
    capture: 'camera',
    mediaType: 'video',
    submitLabel: 'Record Face Check',
    category: 'fast',
    helperLabel: 'Fastest way to prove it is really you with a short guided video',
    reviewLabel: 'Private review',
    isRecommended: true,
    challengeType: 'guided_selfie_video',
  },
];
