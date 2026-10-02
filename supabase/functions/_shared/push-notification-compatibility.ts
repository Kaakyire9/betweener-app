export const LIVE_ROUTING_MINIMUM_APP_VERSION = '1.2.0'

export const LIVE_ROUTING_NOTIFICATION_TYPES = new Set([
  'live_rescheduled',
  'live_cancelled',
  'live_quick_connect_opportunity',
  'live_quick_connect_ready',
  'live_host_assigned',
  'live_host_revoked',
  'live_starting_soon',
  'live_now',
])

export const INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON = 'incompatible_app_version'

type SemanticVersion = {
  core: [number, number, number]
  prerelease: string[]
}

export type PushTokenCompatibility =
  | { compatible: true; minimumAppVersion: string | null }
  | {
      compatible: false
      minimumAppVersion: string
      reason: typeof INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON
    }

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const parseSemanticVersion = (value: unknown): SemanticVersion | null => {
  if (typeof value !== 'string') return null
  const match = value.trim().match(SEMANTIC_VERSION_PATTERN)
  if (!match) return null

  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number]
  if (core.some((part) => !Number.isSafeInteger(part))) return null

  const prerelease = match[4] ? match[4].split('.') : []
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    return null
  }
  return { core, prerelease }
}

const comparePrereleaseIdentifiers = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (leftNumeric && rightNumeric) {
    if (left.length !== right.length) return left.length - right.length
    return left.localeCompare(right)
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
  return left.localeCompare(right)
}

const compareSemanticVersions = (left: SemanticVersion, right: SemanticVersion): number => {
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0
    return left.prerelease.length === 0 ? 1 : -1
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index]
    const rightIdentifier = right.prerelease[index]
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      if (leftIdentifier === rightIdentifier) return 0
      return leftIdentifier === undefined ? -1 : 1
    }
    const comparison = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier)
    if (comparison !== 0) return comparison
  }
  return 0
}

export const isSemanticVersionAtLeast = (value: unknown, minimum: unknown): boolean => {
  const version = parseSemanticVersion(value)
  const floor = parseSemanticVersion(minimum)
  return Boolean(version && floor && compareSemanticVersions(version, floor) >= 0)
}

export const resolveLiveRoutingMinimumAppVersion = (configuredMinimum: unknown): string => {
  if (
    typeof configuredMinimum === 'string'
    && isSemanticVersionAtLeast(configuredMinimum.trim(), LIVE_ROUTING_MINIMUM_APP_VERSION)
  ) {
    return configuredMinimum.trim()
  }
  return LIVE_ROUTING_MINIMUM_APP_VERSION
}

export const evaluatePushTokenCompatibility = (
  notificationType: unknown,
  appVersion: unknown,
  configuredLiveMinimum: unknown = LIVE_ROUTING_MINIMUM_APP_VERSION,
): PushTokenCompatibility => {
  if (typeof notificationType !== 'string' || !LIVE_ROUTING_NOTIFICATION_TYPES.has(notificationType)) {
    return { compatible: true, minimumAppVersion: null }
  }

  const minimumAppVersion = resolveLiveRoutingMinimumAppVersion(configuredLiveMinimum)
  if (isSemanticVersionAtLeast(appVersion, minimumAppVersion)) {
    return { compatible: true, minimumAppVersion }
  }
  return {
    compatible: false,
    minimumAppVersion,
    reason: INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON,
  }
}

export const selectCompatiblePushTokensForDelivery = <T extends { app_version?: unknown }>(
  orderedTokenRows: readonly T[],
  maximumTokenCount: number,
  notificationType: unknown,
  configuredLiveMinimum: unknown = LIVE_ROUTING_MINIMUM_APP_VERSION,
) => {
  const consideredTokens = orderedTokenRows.slice(0, Math.max(0, maximumTokenCount))
  const compatibleTokens: T[] = []
  let suppressedIncompatibleCount = 0

  consideredTokens.forEach((token) => {
    const compatibility = evaluatePushTokenCompatibility(
      notificationType,
      token.app_version,
      configuredLiveMinimum,
    )
    if (compatibility.compatible) compatibleTokens.push(token)
    else suppressedIncompatibleCount += 1
  })

  return {
    consideredTokens,
    compatibleTokens,
    suppressedIncompatibleCount,
  }
}
