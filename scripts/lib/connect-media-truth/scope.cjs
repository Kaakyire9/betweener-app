// Shared deterministic ownership checks; no deletion is permitted on name/prefix alone.
const { profileForLedger, isVersionedProfile } = require('./profiles.cjs');
function assertLedger(ledger, manifest, hash) {
  const profile = profileForLedger(ledger);
  if (!Number.isFinite(Date.parse(ledger.reservedAt)) || !Number.isFinite(Date.parse(ledger.hardDeadlineUtc))
    || !profile || ledger.manifestSha256 !== hash || ledger.experimentId !== manifest.experimentId || !/^[0-9a-f-]{36}$/.test(ledger.callId)
    || !/^[0-9a-f-]{36}$/.test(ledger.marker) || ledger.users?.length !== 2 || new Set(ledger.users).size !== 2
    || ledger.users.some((id, n) => id !== `${profile.userPrefix}${ledger.marker}_${n ? 'b' : 'a'}`)) throw new Error('owned_ledger_invalid');
  if (isVersionedProfile(profile) && (Date.parse(ledger.hardDeadlineUtc) < Date.parse(ledger.reservedAt)
    || Date.parse(ledger.hardDeadlineUtc) - Date.parse(ledger.reservedAt) > manifest.windowsMs.totalBeforeCleanup)) throw new Error('owned_ledger_deadline_invalid');
}
function ownedCall(value, ledger) {
  const profile = profileForLedger(ledger); const ids = value?.members?.map((m) => m.user_id ?? m.user?.id);
  return !!profile && value?.call?.id === ledger.callId && value.call.type === 'betweener_connect'
    && value.call.custom?.[profile.marker] === ledger.marker
    && ids?.length === 2 && new Set(ids).size === 2 && ids.every((id) => ledger.users.includes(id));
}
function ownedUser(user, ledger) {
  const profile = profileForLedger(ledger);
  return !!profile && ledger.users.includes(user?.id) && user.custom?.[profile.marker] === ledger.marker;
}
module.exports = { assertLedger, ownedCall, ownedUser };
