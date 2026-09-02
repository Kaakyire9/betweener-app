# Circles dating experience

## Product role

Circles are trusted shared contexts for dating, not a second matching system.
The member journey is:

> Discover → send an Intent → match → continue in the existing Chat

Supabase remains the authority for membership, discovery consent, candidate
eligibility, intents and matches. Existing Intent, Match and Chat tables and
routes are reused. Circle Live continues to consume the independent Live
platform.

## Information architecture

The Circles home separates `My Circles` from `Find Circles`. A joined Circle
uses three primary member destinations:

1. `Circle`: an editorial home previewing Pulse, Prompts, Gatherings, Moments
   and People without a permanent secondary tab bar.
2. `Discover`: private, consent-gated, Circle-scoped dating candidates.
3. `Live`: the existing Phase 9 Circle Live projection and scheduling flow.

Connections is no longer Circle navigation. A Circle-origin Intent graduates
to the global Intent experience, then to the existing Match and Chat systems.
The underlying connection query remains available for compatibility but is not
mounted from the Circle detail screen.

Active members can open a read-only People directory from the Circle home.
That directory contains public community identity only; it never exposes
dating opt-in, passes, candidate eligibility, private Intent state or member
management controls.

Circle settings, stewardship and safety are opened from the header options.
They do not compete with the member dating navigation.

The main Circles home follows one calm sequence: `Your Circles`, one
Gathering-only `What matters now` priority, global `Relationship Gist`, then
private `Circle Picks`.
`My Circles | Find Circles` remains the discovery switch, so there is no
duplicate “Discover more Circles” action at the bottom. “What matters now”
chooses an active or scheduled Live, or the next in-person Gathering. Prompts,
Warm Introductions and Moments remain inside their individual Circles.
Relationship Gist remains a global editorial feature and is available from
Circles Home.

Relationship Gist is selected through the Supabase-owned
`rpc_get_global_relationship_gists` contract. It returns the current published
global entry per eligible perspective and excludes legacy Circle-scoped Gists.
Reader saves, progress and the last-used perspective sync to the private
`relationship_gist_user_states` table; per-user AsyncStorage remains an offline
cache. The preview is intentionally a fixed editorial teaser rather than a
nested scroller, while the full reader owns long-form reading, accessibility
and reduced-motion behaviour.

Circle Picks enter through a restrained, one-time constellation reveal that
uses only public Circle names and audience-safe suggestion context. Pick cards
show their origin once, one contextual signal and one profile action rather
than repeating the ranking reason. Reduced-motion users receive the completed
layout without the reveal. Circles Home reserves the shared floating tab-dock
height plus the device bottom inset so the final Pick always scrolls fully into
view.

Profiles opened from Circle Picks carry `contextCircleId` separately from their
back-navigation source. Supabase therefore evaluates romantic eligibility in
the originating Circle while the close action returns to Circles Home. Eligible
profiles expose Save, Like, Intent and Gift; community-only People profiles
remain non-romantic.

## Consent and privacy

- Joining a Circle does not opt a member into dating discovery.
- Each member opts into each Circle independently.
- Only two opted-in, active and visible Circle members can discover one another.
- A member can pause discovery without leaving the Circle.
- Hosts cannot see private passes or romantic ranking.
- Blocks, existing matches, pending Intents, recent passes and reciprocal
  confirmed age preferences are enforced by the discovery RPC.
- Candidate ordering is not exposed as a compatibility percentage.
- People opens profiles in `circle-community` context with Like, Signal,
  Intent, gift and other romantic shortcuts removed. Discover opens profiles
  in `circle-discover` context and asks Supabase for action eligibility.

After an active join, members may privately choose why they joined and what
matters to them. The entry step is skippable. Dating consent is a separate,
explicit switch; no community-personalisation choice implies dating consent.
Pending members see the step only after approval.

## Data contracts

Migration `20260830160000_circle_dating_discovery.sql` adds:

- `circle_dating_preferences`: private per-Circle discovery consent;
- `circle_dating_passes`: private 14-day candidate suppression;
- `match_origins`: durable Circle provenance for matches created from a
  Circle-origin Intent;
- trusted preference, candidate, pass and connection RPCs.

The client does not fall back to the raw Circle member directory when the
migration is unavailable. It shows a deployment-safe unavailable state.

Migration `20260831100000_circle_contextual_discovery_engine.sql` adds:

- `circle_member_context`: private, optional entry reasons and priorities;
- `circle_discovery_events`: private exposure and funnel telemetry;
- `is_romantically_eligible`: the central internal eligibility evaluator;
- database triggers that re-evaluate Intent, Signal and Like writes, including
  offline actions when they eventually sync;
- a multi-stage Circle ranker with available-signal normalisation, 70% global
  fit, 30% Circle affinity, exposure balancing, freshness and a deterministic
  70/20/10 relevance/diversification/exploration policy.

Weights are server-owned: relationship intent `.22`, values `.18`, lifestyle
`.14`, interests `.12`, location `.10`, age `.08`, culture `.07`, recency
`.05`, and profile quality `.04`. Missing signals are removed from the
denominator. Clients receive only one to three safe human explanations—never
raw scores, private preferences, rejection reasons, or opt-in lists.

Migration `20260831113000_circle_home_picks.sql` adds one cross-Circle Picks
projection. It considers only Circles where both people explicitly enabled
dating discovery, deduplicates candidates shared through several Circles,
selects one safe origin Circle for profile and Intent context, and reuses the
same eligibility, pass, exposure, Intent, Match and Chat boundaries. There is
no raw-member fallback in the client.

## Deployment and validation

Apply the migration before testing Discover. Then regenerate remote Supabase
types. Validate with at least three accounts:

1. Two active members explicitly opt in; a third remains opted out.
2. The opted-out member never appears as a candidate.
3. A block in either direction removes the pair.
4. Pass removes the candidate and survives refresh.
5. Send Intent opens the existing Intent flow with Circle metadata.
6. Accepting creates one existing match and records `match_origins`.
7. The received Intent appears in the global Intent experience; an accepted
   Intent opens the existing Chat and retains Circle origin context.
8. Pausing discovery removes the member from candidate results without removing Circle membership.
9. Active members can open People and public profiles without seeing dating or
   management state.
10. Legacy Members, Prompts, Gatherings, Moments, Community and Connections
    links map gracefully into Circle or Discover.
11. Circle Live reservation, quorum, scheduling and recap behavior remains unchanged.
12. A direct join opens the optional context step; a pending join does not.
13. People profiles retain Save/report/block but show no romantic actions.
14. Discover profiles show romantic actions only after the server eligibility
    response; direct and queued writes still fail with `dating_not_eligible`
    when state has changed.
15. Circle discovery remains stable for one UTC day and then gently rebalances
    ordering without changing hard eligibility or hiding eligible members.
16. Circle Home Picks remain stable for 72 hours, then prefer unseen or rested
    compatible members; no ranking or batch field is returned to the client.

The current rotation and server-owned delivery contract is documented in
`docs/recommendation-surface-rotation.md`.
