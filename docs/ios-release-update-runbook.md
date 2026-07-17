# iOS release and update runbook

This app has two complementary update paths:

- EAS Update delivers JavaScript and asset fixes to builds with the same `appVersion` runtime.
- The in-app version gate directs users to the App Store when a new native app version is required.

Apple controls whether an App Store binary downloads automatically. Betweener cannot override a
user's iOS automatic-update setting, but it can reliably notify or block unsupported builds.

## Before building

1. Confirm `app.json` contains the intended public version.
2. Confirm the production build profile uses the `production` EAS Update channel.
3. Read the remote iOS build number:

   ```powershell
   npx eas-cli build:version:get --platform ios --profile production
   ```

4. Run the repository release checks.
5. Build with the production profile. `autoIncrement` owns the native build number remotely:

   ```powershell
   npx eas-cli build --platform ios --profile production
   ```

Record the exact version and build shown by EAS and App Store Connect. Do not guess the build
number and do not activate the production version rule yet.

## TestFlight and review

1. Test install, upgrade from the current App Store build, authentication, onboarding, Vibes,
   Chat, notifications, and the Store update button.
2. Submit the tested binary to Apple.
3. Leave the current production `app_version_rules` row unchanged while the release is waiting for
   review or phased release availability.

## Activate after the App Store version is live

Run this in the Supabase SQL Editor only after the App Store page offers the new version. Replace
`<LIVE_BUILD_NUMBER>` with the exact integer from App Store Connect.

```sql
do $$
declare
  affected_rows integer;
begin
  update public.app_version_rules
  set
    latest_version = '1.1.1',
    latest_build_number = <LIVE_BUILD_NUMBER>,
    minimum_supported_version = '1.1.0',
    minimum_supported_build_number = 38,
    update_mode = 'soft',
    update_title = 'A more polished Betweener is ready',
    update_message = 'Update for the latest connection, safety, and performance improvements.',
    whats_new_title = 'Your experience, refined',
    whats_new_items = jsonb_build_array(
      'A richer, more personal onboarding experience',
      'Clearer country-aware location and roots details',
      'Reliability and performance improvements across the app'
    ),
    store_url = 'https://apps.apple.com/app/betweener/id6753134347',
    soft_prompt_cooldown_hours = 24,
    enabled = true,
    updated_at = timezone('utc', now())
  where platform = 'ios'
    and environment = 'production'
    and enabled = true;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'No enabled iOS production app-version rule was updated';
  end if;
end $$;
```

This rollout forces builds older than 1.1.0 (38) to update and gives 1.1.0 (38) users a dismissible
prompt for 1.1.1. After adoption is healthy and the release is confirmed stable, changing
`update_mode` to `force` will require every build behind `latest_version` to update. Use that only
for a security, compatibility, or operational requirement.

## Publish an OTA fix

Only publish code that is compatible with the already-released 1.1.1 native binary:

```powershell
npx eas-cli update --channel production --message "Describe the production fix"
```

The app checks on launch. A downloaded compatible update becomes active on the next cold launch;
Expo's error recovery remains available if the new bundle cannot launch safely.

Never publish a new native dependency, permission, config plugin, entitlement, or native API change
as an OTA update. Increment the app version and ship a new App Store binary for those changes.

## Rollback

- OTA: republish the last known-good commit to `production` or use EAS Update rollback tooling.
- Store gate: restore the previous `app_version_rules` values in a transaction.
- Native release: pause the phased release in App Store Connect if Apple still permits it.
