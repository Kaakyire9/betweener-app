# Circle Media Hub V1

Status: implemented locally on 2026-11-05. Not deployed.

## Delivery order

1. **Safety boundary**
   - `circle_media_assets` is the server-owned source of truth.
   - Clients receive deterministic Storage paths and cannot publish arbitrary URLs.
   - Finalisation verifies Storage ownership, MIME type, byte size and the generated poster.
   - Direct table access and anonymous Circle Pulse RPC execution are revoked.

2. **Performance**
   - Images are capped at 8 MB; videos at 25 MB and 60 seconds.
   - Uploads use resumable TUS with progress.
   - Video URLs are signed only when the viewer opens them.
   - A JPEG poster is generated before upload and used in the feed.

3. **Lifecycle**
   - Published media expires after 90 days by default.
   - A service-only queue archives, purges and removes orphaned Storage objects.
   - Stale drafts expire after 24 hours; stale quarantine records after 7 days.
   - Membership loss clears Circle Pulse snapshots and cached poster images.

4. **Consent and moderation**
   - New assets are quarantined after finalisation.
   - The authenticated moderation function scans the full image or generated video poster.
   - Provenance and rights attestation are mandatory.
   - Recognisable members must approve privately before the asset becomes publishable.
   - Provider failures remain quarantined for review; blocked content is rejected.

5. **Viewer quality**
   - Video starts paused and muted.
   - Tap/play controls, mute, elapsed progress, caption copy and accessible labels are present.
   - Discussion opens are available from both image and video viewers.

6. **Product hub**
   - Media is grouped into one hub with All, Videos, Photos and Saved filters.
   - Members can submit privately; hosts receive a moderation-aware review queue.
   - Hosts publish or decline only after moderation and subject consent complete.

7. **Engagement**
   - Members can save media and choose one lightweight reaction.
   - Discussion remains the long-form engagement surface.
   - Analytics store daily aggregate counters only; no viewer identifier is stored in the analytics table.

## Deployment prerequisites

- Review and apply the four `2026110521*circle_media*` migrations in order.
- Deploy `circle-media-moderation` with `OPENAI_API_KEY` and the existing Supabase secrets.
- Deploy `circle-media-lifecycle`, configure its worker secret, and call the service-only scheduler configuration once.
- Verify Storage upload policies allow authenticated owners to upload only the server-issued object paths.
- Test image, video, subject approval, membership revocation, host review, expiry and cleanup on staging before production.

## Known boundary

Automated video moderation scans the generated poster, not every frame or the audio track. Host review remains required for member-submitted videos. A future version should add sampled-frame and transcript moderation before removing that human review requirement.
