# Infrastructure dependency audit — 16 November 2026

The app's root dependency audit is clean. This independent infrastructure package
has two unresolved moderate audit entries: `aws-cdk-lib` and its bundled
`minimatch@10.2.6`, both from the same advisory,
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

The compatible dependency refresh and the same minimatch override used by the
app removed eight other audit entries. `aws-cdk-lib@2.277.0`, the latest compatible
published release checked here, still bundles the affected version. npm overrides
cannot replace that bundled copy. This is tracked in the upstream
[CDK issue #39594](https://github.com/aws/aws-cdk/issues/39594) and
[PR #39595](https://github.com/aws/aws-cdk/pull/39595).

The advisory concerns excessive CPU and memory use from attacker-controlled glob
patterns with optimization level 2 or higher. This package is deployment tooling,
not a dependency shipped in the mobile app. The upstream issue reports that CDK
does not enable that optimization level. This lowers the known exposure; it does
not make the installed vulnerable package or its audit finding disappear.

Keep the audit findings visible. Do not use `npm audit fix --force` to downgrade
CDK, replace the bundled files manually, or add an audit-ignore exception. Update
to a supported CDK release that bundles patched minimatch when available, then
rerun `npm ci`, `npm run check` and `npm audit --include=dev --audit-level=moderate`.
No AWS synthesis, deployment, credentials, or hosted resource changes were used
for this validation.
