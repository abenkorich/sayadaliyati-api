# Android client — first connected slice

## Available now

`apps/mobile` is an Expo SDK 57 / React Native 0.86 client using Expo Router,
SecureStore and the existing API. It includes:

- Patient registration and sign-in with email or international phone number.
- Secure session restoration and serialized single-use refresh rotation.
- Medicine search and details, with paginated results.
- Existing treatment lists, schedules and confirmed TAKEN/SKIPPED records.
- Reminder inbox, treatment navigation and read-all.
- Explicit notification preferences and sign-out.

The UI is English for this milestone and uses the repository's teal design tokens.
Registration captures the device timezone and chooses English. Treatment dates
remain in the schedule's stored timezone. Treatment creation, prescription uploads,
inventory editing and profile editing are not yet available on mobile. New accounts
therefore start with empty treatment lists; existing API-created treatments appear.
No sample medicine or treatment is inserted automatically.

Refresh tokens live in SecureStore; access tokens stay in memory. Refresh calls
are serialized. The stored single-use token is removed before sending a refresh;
an ambiguous network failure requires sign-in rather than replaying a potentially
consumed token. Sign-out clears local credentials even if remote revocation fails;
the server session can then remain valid until its existing expiry. No patient
payloads or credentials are logged or persisted in an offline cache.

## Test with USB on an Android phone

Use the pinned Node 24.21.0 and pnpm 11.24.0 from the workspace setup.

1. Run `pnpm install --frozen-lockfile`, `pnpm build`, and the existing local
   database/storage setup. Run `pnpm api:start` in its own terminal. The API can
   remain bound to 127.0.0.1. Run `pnpm worker:start` separately for inbox reminders.
2. Enable Android USB debugging, connect the phone and confirm it appears in
   `adb devices`. Authorize your computer on the phone when Android asks.
3. Run `adb reverse tcp:3000 tcp:3000` and `adb reverse tcp:8081 tcp:8081`.
4. Copy `apps/mobile/.env.example` to `apps/mobile/.env`; set
   `EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1` for the USB connection.
5. Install an Expo Go version compatible with SDK 57 on the phone, then run
   `pnpm mobile:start -- --localhost`. If your package manager does not forward
   that option, run `pnpm --filter @saydaliyati/mobile exec expo start --localhost`.
   Open `exp://127.0.0.1:8081` in Expo Go using the CLI's device launch option or
   `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081`.

An Android emulator instead uses `http://10.0.2.2:3000/api/v1`; start it first and
run `pnpm mobile:android`. Physical-device testing has not been performed in this
workspace: adb found no connected device and no configured emulator.

For Wi-Fi testing, use the computer's private LAN address and explicitly bind the
API to that interface. USB is the simpler local path and avoids exposing the API
to the LAN. Restart Metro after changing EXPO_PUBLIC_API_URL. These values are
public build configuration, never a place for passwords, service keys or tokens.

## Push delivery prerequisites

This client reads the API inbox. It does not register a device token, request OS
notification permission or deliver background push. Expo Go on Android does not
support remote push; a development build is required.

The next push integration needs a user-owned Expo/EAS project and Android Firebase
project, google-services.json, FCM v1 service credentials stored on the server/build
service, and a connected test phone or configured emulator. Those project details
and credentials are not present in this repository, so no provider account,
billing resource, device registration endpoint or delivery claim was fabricated.
Keep service credentials out of source control and EXPO_PUBLIC variables.

Before enabling delivery, implement authenticated device ownership/revocation,
explicit OS permission, opt-out synchronization, provider tickets/receipts,
invalid-token cleanup and deduplication independently of inbox delivery.

Official setup: [Expo push prerequisites](https://docs.expo.dev/push-notifications/push-notifications-setup/)
and [Android remote notification limitations](https://docs.expo.dev/versions/latest/sdk/notifications/).

## Validation

`pnpm check` includes six mobile session-client tests alongside existing API checks.
After the dedicated test databases have been migrated with `pnpm test:integration`,
run `pnpm --filter @saydaliyati/mobile test:integration` for an actual local API
round trip using a temporary synthetic account that is removed afterward.

`EXPO_PUBLIC_API_URL=https://your-api.example/api/v1 pnpm mobile:bundle` verifies an
Android Hermes bundle. Use your real HTTPS endpoint for a release; this command
produces JavaScript/assets, not an installable APK. HTTP endpoints are accepted
only in development mode. Native rendering, keyboard/accessibility behavior,
SecureStore on hardware, process restart and phone push remain device acceptance
checks before calling the app ready for release.
