export const PUSH_PROVENANCE_REASONS = {
  missing: 'PUSH_ENVIRONMENT_PROVENANCE_MISSING',
  environmentMismatch: 'PUSH_ENVIRONMENT_MISMATCH',
  applicationMismatch: 'PUSH_APPLICATION_ID_MISMATCH',
  projectMismatch: 'PUSH_PROJECT_ID_MISMATCH',
  installationMissing: 'PUSH_INSTALLATION_ID_MISSING',
  notVerified: 'PUSH_PROVENANCE_NOT_VERIFIED',
  quarantined: 'PUSH_TOKEN_QUARANTINED',
} as const

export type PushEnvironmentConfig = {
  appEnvironment: string
  applicationId: string
  expoProjectId: string
}

export type PushTokenProvenance = {
  app_environment?: unknown
  application_id?: unknown
  expo_project_id?: unknown
  installation_id?: unknown
  provenance_status?: unknown
  quarantined_at?: unknown
}

export type PushProvenanceDecision = {
  allowed: boolean
  reason: string | null
}

const normalized = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

export const evaluatePushTokenProvenance = (
  token: PushTokenProvenance,
  expected: PushEnvironmentConfig,
): PushProvenanceDecision => {
  const appEnvironment = normalized(token.app_environment)
  const applicationId = normalized(token.application_id)
  const expoProjectId = normalized(token.expo_project_id)
  const installationId = normalized(token.installation_id)

  if (!appEnvironment || !applicationId || !expoProjectId) {
    return { allowed: false, reason: PUSH_PROVENANCE_REASONS.missing }
  }
  if (token.quarantined_at) {
    return { allowed: false, reason: PUSH_PROVENANCE_REASONS.quarantined }
  }
  if (appEnvironment !== normalized(expected.appEnvironment)) {
    return { allowed: false, reason: PUSH_PROVENANCE_REASONS.environmentMismatch }
  }
  if (applicationId !== normalized(expected.applicationId)) {
    return { allowed: false, reason: PUSH_PROVENANCE_REASONS.applicationMismatch }
  }
  if (expoProjectId !== normalized(expected.expoProjectId)) {
    return { allowed: false, reason: PUSH_PROVENANCE_REASONS.projectMismatch }
  }
  if (!installationId) {
    return { allowed: false, reason: PUSH_PROVENANCE_REASONS.installationMissing }
  }
  if (normalized(token.provenance_status) !== 'verified') {
    return { allowed: false, reason: PUSH_PROVENANCE_REASONS.notVerified }
  }
  return { allowed: true, reason: null }
}
