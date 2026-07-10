export type AppVersionEnvironment = 'production' | 'staging' | 'development';

export type AppUpdateMode = 'silent' | 'soft' | 'force';

export type AppVersionRule = {
  platform: 'ios' | 'android';
  environment: AppVersionEnvironment;
  latestVersion: string;
  latestBuildNumber: number;
  minimumSupportedVersion: string;
  minimumSupportedBuildNumber: number;
  updateMode: AppUpdateMode;
  updateTitle: string | null;
  updateMessage: string | null;
  whatsNewTitle: string | null;
  whatsNewItems: string[];
  storeUrl: string;
  softPromptCooldownHours: number;
};

export type InstalledAppVersion = {
  platform: 'ios' | 'android';
  environment: AppVersionEnvironment;
  version: string;
  buildNumber: number;
  versionKey: string;
};

export type AppVersionDecision = {
  status: 'continue' | 'show_soft_update' | 'force_update';
  rule: AppVersionRule;
  installed: InstalledAppVersion;
  isBelowMinimum: boolean;
  isBehindLatest: boolean;
};

export type CachedVersionRuleState = {
  checkedAt: number;
  rule: AppVersionRule;
};

export type SoftPromptDismissalState = {
  versionKey: string;
  dismissedAt: number;
};
