# Chat Local-First Real-Device Test

Use two real devices signed into two different Betweener accounts. Prefer one iOS and one Android if available.

## Before Testing

Run:

```sh
npm run typecheck
npm run test:chat-logic
npx expo-doctor
```

Use a development or preview build. `react-native-mmkv` requires a native build, so do not use Expo Go for this pass.

Start Metro for a dev client:

```sh
npx expo start --dev-client
```

Confirm these migrations are already applied to the Supabase project you are testing:

- `20260522_01_chat_typing_state.sql`
- `20260525_01_messages_client_message_id.sql`

## Core Scenarios

1. Online cold start
   - Open the app fresh.
   - Chat list should render cached conversations immediately.
   - Open a media-heavy thread; messages should show before remote sync finishes.
   - Expected: no full-screen loader if local rows exist.

2. Offline cold start with cache
   - Open a known chat once online.
   - Kill the app.
   - Enable airplane mode.
   - Reopen the app.
   - Chat list and thread should show cached data, not a blank loader.
   - Expected: offline state is subtle; cached messages remain readable.

3. Offline send and restart
   - Stay offline.
   - Send a text, image/video, and voice note.
   - Kill and reopen the app offline.
   - Pending bubbles should still be visible.
   - Reconnect.
   - Each pending message should send once, reconcile to server ids, and not duplicate.
   - Expected: pending state survives app restart and clears after successful sync.

4. Presence
   - Device B opens Device A chat.
   - Device A should show Active now/Online.
   - Device B backgrounds or closes app.
   - Device A should stop showing Active now and last seen should restart from the new leave time.
   - Expected: if B was last seen 17m ago before opening chat, leaving should reset the clock to just now, not continue at 18m.

5. Typing
   - Type on Device B.
   - Device A should show Typing in the open thread and chat list.
   - Stop typing.
   - Typing should clear within a few seconds.

6. Clear/hide privacy
   - Hide one message for me.
   - Kill and reopen.
   - Hidden message should not return from SQLite.
   - Clear chat for me.
   - Kill and reopen.
   - Thread should remain cleared locally.
   - Expected: realtime/server refresh does not resurrect hidden local rows.

7. Read/delivery
   - Send from Device A to Device B.
   - Device B opens the thread.
   - Device A receipt should move to delivered/read.
   - Kill and reopen Device A.
   - Receipt state should remain correct from local storage.

8. Chat list stability
   - Open the chat list with New Matches available.
   - Wait 30 seconds.
   - Pull to refresh once.
   - Open a media-heavy thread, scroll down, then release.
   - Expected: New Matches sync should not continuously refresh the chat list or drag the open thread position.

9. Account boundary
   - Explicitly sign out.
   - Sign in as a different account on the same device.
   - Expected: the new account does not see the previous account's local chat rows.

## Failure Signs

- Chat list goes blank while local data exists.
- Pending messages duplicate after reconnect.
- Cleared or hidden messages return after restart.
- Last seen resumes from an old timestamp after a user leaves.
- Media-heavy thread jumps back to the top after background sync.
- A session refresh/sign-in issue wipes local chat before explicit logout.

## What To Capture

- Device model and OS.
- Build type: dev client, preview, or TestFlight/Internal testing.
- Network state: Wi-Fi, mobile data, airplane mode, weak network.
- Screen recording for any failure.
- Redacted console/Sentry event names only. Do not capture private message bodies.
