# Unreleased Connect preparation

These modules are isolated offline preparation, not part of the app's mounted
calling path. Their tests do not establish encrypted media or native device readiness.

`call-encryption.ts` models the installed SDK's encryption lifecycle behind an
authenticated key-agent interface. No key agent is installed. Do not integrate it
until key distribution, provider policy, native support and lifecycle behaviour
have been reviewed and validated. All capability declarations remain false.

Use [the current Connect entry point](../../../docs/betweener-connect/README.md)
for active implementation and testing.
