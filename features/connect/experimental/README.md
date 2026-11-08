# Connect encryption lifecycle

`call-encryption.ts` is now used by the mounted native adapter when the server
requires E2EE. Its existing import path avoids duplicate lifecycle implementations.
The authenticated account/device agent lives in `../security/`. The new server
gate defaults off; local tests do not establish encrypted media or native device
readiness. Provider policy, native support and physical validation remain
activation prerequisites.

The call must already have the server-selected `auto-on` encryption mode, and
setup must complete before join. Plain calls cannot be upgraded in place. The
preparation fails before any key request for an ordinary or already-joined call;
it also rejects a join racing native manager construction. No server-readable
shared key or existing installation-wide chat keypair substitutes for a verified
account/device key-exchange agent.

Use [the current Connect entry point](../../../docs/betweener-connect/README.md)
for active implementation and testing.
