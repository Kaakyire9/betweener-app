# Open questions and owner decisions

No implementation should begin until the blocking decisions are recorded. Recommended defaults are intentionally conservative.

## Blocking decisions

| Decision | Recommended default | Alternatives / consequence | Owner |
|---|---|---|---|
| User-facing reflection name | **Daily Insights** | “Connection Compass” collides with the existing Relationship/Love Compass and risks implying matching influence. Renaming the existing feature is a separate product migration. | Product/brand |
| Data isolation from matching | Dedicated `daily_reflection_*` tables; never read/write `profiles.relationship_compass`; recommendation consent off. | Reusing the existing field is rejected because it currently feeds recommendation RPCs. | Product + privacy + engineering |
| Launch release clock | One global UTC daily release. Display local time. | Ghana/UK regional calendars add editorial and travel rules; user-local release adds substantial abuse/DST complexity. | Product/editorial |
| Launch locales | Start with one reviewed English locale; define fallback explicitly. | en-GB + Ghanaian English variants require separate review and aggregate segmentation/threshold planning. | Editorial |
| Aggregate threshold | Minimum 20 valid unique completions, delayed stable snapshot, rounded to 5%, total band only. | Higher threshold offers more privacy but less availability. Must be approved by privacy/security. | Privacy/data |
| Raw response retention | 12 months maximum, subject to legal review; shorter for incomplete sessions. | Longer improves longitudinal analysis but raises privacy/cost risk. | Privacy/legal |
| Insights evidence threshold | ≥4 eligible plays, ≥3 release days, ≥2 independent sources; no cultural/safety mappings. | Higher threshold is safer but slower to show value. | Product/privacy/editorial |
| Circle target formula | Freeze at weekly open using active-member count; 3 minimum, 40 maximum pilot target. | Dynamic targets are confusing/gameable; fixed universal targets disadvantage small Circles. | Circles product/data |
| Circle selection | Explicit confirmation for first contribution; remember choice for display but confirm each credit; change takes effect next release day. | Fully automatic credit reduces agency; per-play selector adds friction. | Product/privacy |
| Gist dependency | Repair first; keep link flag off until immutable revisions and saved/offline fixes pass. | Ship Daily without Gist link for faster, safer pilot. | Product/editorial/engineering |
| AI provider/data terms | Use an approved server-side provider/config with no training/retention beyond contract; human approval mandatory. | Human-only authoring remains a valid fallback. | Security/legal/editorial |
| Pilot experiment | Sequential rollout if traffic cannot power four cells; freeze pre-treatment unmatched cohort. | Four concurrent cells need actual power analysis. | Data/product |

## Important non-blocking design choices

1. Should “Read the Room” expose only global distribution, or a separately thresholded country region later? Recommendation: global only in MVP; do not expose Circle or demographic slices.
2. Should a member be able to delete one raw answer while retaining the completion receipt? Recommendation: yes—replace answer with a deletion marker and remove it from future aggregates/Insights where feasible; keep minimal anti-farming receipt.
3. Should replays reveal every Date Rescue branch immediately? Recommendation: after first completion, allow private exploration with clear “replay—no new credit” copy.
4. Should Insight weights decay? Recommendation: use recent-window weighting for displayed reflection while retaining user-visible source dates within the retention window; document it plainly.
5. How long should match-comparison consent last? Recommendation: per challenge invitation, seven-day expiry, revocable at any time; feature remains post-MVP/off.
6. Does an archived Circle keep its completed garden? Recommendation: read-only cosmetic history until Circle data retention removes it.
7. Should Daily have reminders? Recommendation: no push in pilot. Evaluate organic value first; any later reminder is opt-in with quiet hours and frequency cap.
8. What qualifies as a meaningful Gist read? Recommendation: pre-register a combined minimum foreground duration and scroll progress, with accessibility exceptions, not simple open.

## Questions requiring repository/runtime evidence later

These are **UNVERIFIED** because this audit used no remote access:

- Actual dev/staging/prod schema parity and whether all local Gist migrations are deployed.
- Current active-user volume, unmatched pre-treatment cohort size, D7/D30 baselines and experiment power.
- Existing analytics warehouse/provider, event governance and deletion support.
- Real moderation/editorial staffing, review turnaround and ability to maintain a 14-day buffer.
- Production RLS function ownership/search paths and scheduled-job mechanism.
- Minimum supported app/runtime versions for the pilot.
- Existing legal basis, privacy notice language, age policy, processor terms and DPIA inventory.
- Whether current account export covers Supabase feature tables; deletion code exists but Daily/Gist coverage must be tested.
- Whether staging has representative Circles of different sizes for fair-target QA.

## Rejected shortcuts

- **Reuse existing Relationship Compass data:** rejected; it is a recommendation/discovery surface (`app/relationship-compass.tsx:592`).
- **Compute completion or Insight scores on device:** rejected; tamperable and inconsistent across versions.
- **Show seeded/fake community votes:** rejected; violates the product promise and privacy-safe measurement.
- **Award Sparks for play:** rejected; introduces farming/economy risk and changes motivation.
- **Automatic Circle contribution:** rejected; explicit selection and privacy explanation are required.
- **AI publishes on a schedule:** rejected; AI may draft only.
- **Put all formats into the Circles screen:** rejected; that route is already oversized and Daily must work without Circles.
- **New bottom tab:** rejected for MVP; existing Vibes/Circles entries and one route are enough.
- **Public comments at launch:** rejected; moderation burden distracts from validating solo play.
- **Use Redis/game backend immediately:** rejected; existing Supabase infrastructure is sufficient until measured contention proves otherwise.

## Approval record template

Before implementation, create an owner-approved decision record outside this audit with:

```text
Decision:
Chosen option:
Reason:
Product owner:
Engineering owner:
Privacy/security reviewer:
Editorial reviewer:
Date:
Conditions / revisit trigger:
```

Required approvals: product scope/name, privacy/DPIA path, data retention, aggregate threshold, editorial capabilities/workflow, launch calendar/locale, Circle formula, experiment design and staged-environment authorization. Production approval is separate and is not implied by approval to implement or stage.
