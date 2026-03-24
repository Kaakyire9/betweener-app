# Account Merge Recovery

This is the duplicate-account recovery path for users who already created two or more Betweener accounts before linking their sign-in methods.

## Goal

Keep prevention on the normal auth flow, and handle already-split accounts through a support or operations workflow that is auditable and reversible enough to review.

The new database scaffold lives in:

- `public.account_merge_cases`
- `public.account_merge_events`
- `public.rpc_admin_create_account_merge_case(...)`
- `public.rpc_admin_get_account_merge_queue()`
- `public.rpc_admin_update_account_merge_case(...)`
- `public.rpc_admin_preview_account_merge_case(...)`

## Why This Is Admin-Only

Betweener stores identity in both places:

- `auth.users.id`
- `public.profiles.id`

Many product tables reference one or both. That means a duplicate-account recovery is a data migration, not just an auth setting.

Examples already in the current schema:

- `public.profiles.user_id`
- `public.date_plans.creator_user_id`
- `public.date_plans.recipient_user_id`
- `public.date_plans.creator_profile_id`
- `public.date_plans.recipient_profile_id`
- `public.date_plan_concierge_requests.requested_by_user_id`
- `public.date_plan_concierge_requests.requested_by_profile_id`

Because of that, no regular-user self-serve merge is recommended yet.

## Lifecycle

1. `pending`
- case created by support or operations

2. `reviewing`
- human confirms source and target really belong to the same person

3. `approved`
- case is valid and ready for a merge run

4. `scheduled`
- optional holding state before execution

5. terminal states
- `completed`
- `rejected`
- `failed`
- `cancelled`

Every state change is logged to `public.account_merge_events`.

## Preflight

Run `public.rpc_admin_preview_account_merge_case(case_id)` before any merge execution.

It inventories rows that still point at the source account by scanning known user/profile foreign-key style columns across `public.*`.

The preview writes its result into `account_merge_cases.preflight_summary` and returns:

- source user/profile ids
- target user/profile ids
- total user-reference rows
- total profile-reference rows
- per-table, per-column counts

This tells support whether the case is tiny, medium, or high-risk before anyone touches production data.

## Execution Model

Do not blindly rewrite every matching UUID column.

Use this order when the real execution RPC is added:

1. Freeze the case
- set case to `approved` or `scheduled`
- confirm both accounts still exist
- confirm target is the keeper

2. Capture a snapshot
- export source profile row
- export target profile row
- export preflight summary

3. Resolve singleton conflicts first
- tables where target may already own a unique row need a policy before any reassignment
- examples: `profiles`, settings-like tables, account-level preferences

4. Move profile-scoped rows
- rows that reference `source_profile_id`
- examples: prompts, profile signals, notes, gifts, views, reactions, circles memberships

5. Move user-scoped rows
- rows that reference `source_user_id`
- examples: system messages, verification requests, push tokens, subscriptions, inbox-like records

6. Move mixed relationship rows
- rows that store both user and profile ids
- examples: `date_plans`, `date_plan_concierge_requests`

7. Resolve pairwise uniqueness conflicts
- swipes, reactions, pair keys, or deduplicated join tables may collide when source and target already both have rows
- these need table-specific merge rules:
  - keep newest
  - keep oldest
  - merge metadata
  - delete exact duplicate

8. Disable the source account operationally
- sign out sessions if needed
- mark support record as completed
- only hard-delete after confidence is high and dependencies are clean

## Recommended Next Step

Build the next layer as an admin-only executor, not a client feature.

That executor should:

- consume one approved merge case
- run in a transaction where possible
- apply table-specific merge rules
- write a structured `execution_summary`
- fail closed if a uniqueness conflict is not explicitly handled

## Product Rule

Keep the main user experience focused on prevention:

- link Google and Apple in the same account
- show the banner for single-method accounts
- show the sign-out reminder for single-method accounts

That reduces how often this recovery path is needed.
