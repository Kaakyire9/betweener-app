# Vibes V5 recommendation engine

V5 is a reciprocal hybrid recommender. It keeps V4 as its candidate generator
and adds pair-level eligibility, explicit Relationship Compass compatibility,
time-decayed behavioural taste, and controlled exploration.

V5.1 calibrates that behavioural layer against the viewer's own exposure
baseline. It uses one outcome per unique profile, collapses repeated event
funnels, shrinks sparse evidence, centres competing values, ignores vague
answers, and caps learned weights at `0.85`. The public V5 RPC contract remains
unchanged.

## What V5 optimizes

V5 ranks for the probability of a meaningful reciprocal connection rather than
raw profile engagement. Its current signals are:

- mutual age eligibility;
- relationship intention compatibility;
- explicit shared interests;
- explicitly selected faith, family, verification and lifestyle priorities;
- learned interests, intention, personality, lifestyle, media and activity taste;
- V4 location, roots, freshness, verification, profile quality and market outcomes;
- locality diversity and exploration for low-confidence viewers.

Implicit learning intentionally excludes religion, ethnicity, tribe, roots and
other sensitive identity attributes. Those signals only affect ranking when the
viewer explicitly configures the corresponding preference.

## Safe rollout

1. Apply `20260714150000_vibes_v5_reciprocal_intelligence.sql`, followed by
   `20260715100000_vibes_v5_1_taste_calibration.sql`.
2. Confirm the `vibes-v5-taste-refresh` pg_cron job exists. If pg_cron was not
   available during deployment, invoke `rpc_process_vibes_v5_taste_jobs(150)`
   every five minutes with the service role.
3. Regenerate Supabase TypeScript types after the migration reaches the target
   project.
4. Release the client. It calls V5 first and falls back to V4 automatically.
5. Monitor V5 by filtering `vibes_events.metadata.recommendation_version`.

No existing RPC is renamed or removed by the V5 migration.

## Validation

Run the transactional migration contract and runtime smoke test:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' `
  --dbname='postgresql://postgres:postgres@127.0.0.1:54322/postgres' `
  --file='scripts/validate_vibes_v5_migration.sql'
```

The script creates synthetic users inside a transaction and rolls everything
back. It validates:

- authenticated-only RPC access;
- RLS and private internal taste state;
- transferable taste generation;
- exposure-aware positive and negative taste calibration;
- protection against saturated or vague learned weights;
- reciprocal age filtering;
- response versioning;
- coordinate privacy.

## Metrics to compare V5 with V4

Use recommendation version as the cohort key and measure:

- card-to-profile-open rate;
- like / signal / intent rate per impression;
- reciprocal match rate;
- first reply within 24 hours;
- conversations reaching six messages;
- block, report and immediate-unmatch rate;
- candidate exposure distribution;
- seven-day return rate after a match.

The primary success metric should be reciprocal conversations reaching six
messages. Raw likes and dwell time are diagnostic metrics, not the objective.

## Known boundary

The current profile schema does not store an explicit gender-interest set. V5
therefore inherits V4's existing gender candidate eligibility. A future schema
upgrade should add explicit multi-value gender preferences and enforce them in
both directions before candidate retrieval.
