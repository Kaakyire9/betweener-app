# Betweener S staging setup

Betweener S is a separate installable app for QA. It must never be submitted as the public Betweener product.

| Property | Staging | Production |
| --- | --- | --- |
| Display name | Betweener S | Betweener |
| iOS bundle ID | `com.aduboffour.betweener.staging` | `com.aduboffour.betweener` |
| Android package | `com.aduboffour.betweener.staging` | `com.aduboffour.betweener` |
| URL scheme | `betweenerstaging` | `betweenerapp` |
| Web origin | `https://staging.getbetweener.com` | `https://getbetweener.com` |
| Supabase project | Betweener Staging (`xsgzxadwuxuziubglvps`) | Betweener App (`jbyblhithbqwojhwlenv`) |
| EAS environment | `preview` | `production` |
| EAS Update channel | `staging` | `production` |

The dynamic configuration refuses an EAS build when the app identity, environment, Supabase project or Firebase configuration does not match.

## Current EAS audit

The `preview` environment currently points to the correct Betweener Staging Supabase project and already contains Maps and Sentry configuration. Before the first store-signed staging build:

- Add `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST` as staging Firebase file variables.
- Add the three staging GIPHY platform keys.
- Replace the current RevenueCat configuration with keys from a dedicated staging RevenueCat project, or remove those keys until staging billing is ready.
- Verify the existing Maps keys permit only the staging bundle/package and signing certificates.

The build guard validates both Firebase files against the selected bundle/package and rejects a mismatched file.

The production EAS environment also needs its missing Supabase anonymous key, platform GIPHY keys and iOS Firebase plist added before the final production iOS build. The production Android Firebase JSON remains available through its local fallback, but moving it to an EAS file variable will make both environments consistent.

## 1. Apple Developer and App Store Connect

1. In Apple Developer, open Certificates, Identifiers & Profiles > Identifiers and register an explicit App ID:
   - Description: `Betweener S`
   - Bundle ID: `com.aduboffour.betweener.staging`
2. Enable the capabilities used by production, including Push Notifications, Associated Domains and Sign in with Apple.
3. Configure Sign in with Apple as a related app grouped under the existing production primary App ID. This keeps the Apple identity relationship intentional.
4. In App Store Connect, create a new iOS app record:
   - Name: `Betweener S`
   - Bundle ID: `com.aduboffour.betweener.staging`
   - SKU: `BETWEENER-STAGING-IOS`
   - Access: limit it to the engineering/test team if desired.
5. Use this record for TestFlight only. Do not submit Betweener S to App Review for public distribution.
6. Add internal TestFlight testers. Add external testers only if a wider beta is required; external TestFlight testing can require Beta App Review.
7. Run `eas credentials --platform ios`, select `testflightStaging`, and let EAS create or reuse the distribution certificate, provisioning profile and APNs key for the staging bundle ID.
8. After the App Store Connect record exists, copy its numeric Apple ID into `submit.testflightStaging.ios.ascAppId` in `eas.json` for non-interactive submissions.

Official references:

- https://developer.apple.com/help/account/identifiers/register-an-app-id/
- https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app
- https://developer.apple.com/help/account/capabilities/about-sign-in-with-apple/

## 2. Google Play Console

1. Create a new app named `Betweener S` in Play Console.
2. Keep it unpublished and use only Test and release > Testing > Internal testing.
3. The first uploaded AAB fixes the package name permanently, so verify it is `com.aduboffour.betweener.staging` before uploading.
4. Create an internal tester email list and add the QA accounts.
5. Upload the first AAB manually or submit it through the `playInternal` EAS profile.
6. Open Test and release > Setup > App integrity and copy the Play App Signing SHA-1/SHA-256 fingerprints. Use those fingerprints in Firebase and Google Maps restrictions.
7. Add the Google Play service account used by EAS and grant only the permissions required to manage releases for Betweener S.
8. Leave production, open testing and the public store listing disabled for this staging app.

Official references:

- https://support.google.com/googleplay/android-developer/answer/9845334
- https://docs.expo.dev/submit/android/

## 3. Firebase and push notifications

Use a separate Firebase project named `Betweener Staging`. Firebase recommends separate projects for staging and production environments.

1. Register an Android app with package `com.aduboffour.betweener.staging`.
2. Register an iOS app with bundle ID `com.aduboffour.betweener.staging`.
3. Download the staging `google-services.json` and `GoogleService-Info.plist` files.
4. In the EAS project environment variables, add both files to the `preview` environment as secret file variables:
   - `GOOGLE_SERVICES_JSON`
   - `GOOGLE_SERVICE_INFO_PLIST`
5. Generate an FCM V1 service-account key for the staging Firebase project and upload it in Expo/EAS Credentials under the staging Android application identifier.
6. Configure APNs for the staging iOS identifier through EAS credentials.
7. Never reuse production Firebase configuration files in a staging build.

Official references:

- https://firebase.google.com/docs/projects/multiprojects
- https://docs.expo.dev/push-notifications/fcm-credentials/
- https://docs.expo.dev/eas/environment-variables/manage/

## 4. EAS preview environment

The staging profiles deliberately use the EAS `preview` environment. Configure its values in Expo Dashboard > Project settings > Environment variables.

Required staging values include:

- `EXPO_PUBLIC_SUPABASE_URL` for project `xsgzxadwuxuziubglvps`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` from Betweener Staging
- `EXPO_PUBLIC_SENTRY_DSN`
- staging Google Maps keys
- staging GIPHY keys
- staging RevenueCat keys and product identifiers
- the two Firebase file variables above
- any other `EXPO_PUBLIC_*` value currently present in production that the staging build needs

Do not define `APP_VARIANT` in the EAS dashboard. Build profiles own that value so an environment-variable edit cannot change the native identity.

Verify variable names without printing secret values:

```bash
eas env:list --environment preview
```

## 5. Supabase staging

In Betweener Staging > Authentication > URL Configuration:

1. Set Site URL to `https://staging.getbetweener.com`.
2. Add these exact redirect URLs:
   - `betweenerstaging://auth/callback`
   - `https://staging.getbetweener.com/auth/callback`
3. Configure Google OAuth for the staging Supabase project. Add this authorized redirect URI to its Google OAuth web client:
   - `https://xsgzxadwuxuziubglvps.supabase.co/auth/v1/callback`
4. Verify Apple authentication settings and email templates in the staging project.
5. Deploy the same approved schema and Edge Functions used by the app, but supply staging-only function secrets.

Official reference: https://supabase.com/docs/guides/auth/redirect-urls

## 6. Staging domain and universal links

1. Create `staging.getbetweener.com` and deploy the web callback route with staging environment variables.
2. Serve an Apple association file at `https://staging.getbetweener.com/.well-known/apple-app-site-association` containing the staging application identifier.
3. Serve Android Digital Asset Links at `https://staging.getbetweener.com/.well-known/assetlinks.json` containing `com.aduboffour.betweener.staging` and the Play App Signing SHA-256 fingerprint.
4. Confirm both files return HTTP 200 without redirects and with the correct JSON content type.

The checked-in staging `assetlinks.json` contains the dedicated EAS staging keystore certificate and supports directly installed EAS-signed APKs. Before distributing an AAB through Google Play, enroll the staging app in Play App Signing and add the Play App Signing SHA-256 certificate to the same fingerprint array. Keep the EAS fingerprint so internal APKs continue to verify.

## 7. Other third parties

### Google Maps

Create separate staging Android and iOS API keys. Restrict Android to the staging package plus its signing SHA-1, and restrict iOS to the staging bundle ID. Restrict each key to only the Maps APIs it uses.

Reference: https://developers.google.com/maps/api-security-best-practices

### RevenueCat

Create a separate RevenueCat project named `Betweener Staging`, then add the staging iOS and Android apps. Use RevenueCat Test Store first if billing integration is not ready. Store staging SDK keys and product identifiers only in the EAS `preview` environment.

Reference: https://www.revenuecat.com/docs/projects/connect-a-store

### Sentry

The same Sentry project can be retained because the application already tags events with `environment=staging`. Add a separate Sentry project later only if staging volume obscures production alerts.

### GIPHY

Create staging SDK keys when possible so quota and usage analytics remain separate. Put them only in the EAS `preview` environment.

### Stream, Twilio and moderation providers

Keep their server keys in Betweener Staging Edge Function secrets, never in the mobile environment. Use sandbox/test credentials and staging webhook endpoints wherever the provider supports them.

## 8. Build and distribute

Internal staging builds:

```bash
eas build --platform ios --profile staging
eas build --platform android --profile staging
```

TestFlight staging:

```bash
eas build --platform ios --profile testflightStaging
eas submit --platform ios --profile testflightStaging
```

Google Play internal staging:

```bash
eas build --platform android --profile playInternal
eas submit --platform android --profile playInternal
```

Final store candidate, connected to production:

```bash
eas build --platform all --profile production
```

Only the production build is submitted for Apple App Review and Google Play production review.

## 9. Acceptance checks

- Betweener and Betweener S install together on the same phone.
- The staging icon and app name are visually distinct.
- Staging login, magic links and password recovery reopen Betweener S.
- Production links never open Betweener S and staging links never open Betweener.
- Staging accounts, chats, media and notifications never appear in production.
- Push notifications reach the correct app variant.
- Maps load on both iOS and Android.
- Purchases use sandbox/test accounts only.
- Sentry events show the correct environment.
- OTA updates published to `staging` never reach `production`.
