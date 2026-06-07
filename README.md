# PeakStream POV — Mentra glasses broadcaster

A minimal standalone Android app that connects to Mentra Live glasses over
Bluetooth and tells them to stream their camera to your own server. One screen:
**Connect → Go Live → Stop**, with an RTMP / WebRTC toggle. Both protocols ship
in the same build — the SDK picks the protocol from the URL prefix.

This uses `@mentra/bluetooth-sdk` (the standalone BLE SDK). It does **not** use
Mentra's cloud or MiniApp infrastructure.

## Files
- `App.tsx` — app entry; renders the broadcaster screen.
- `src/BroadcasterScreen.tsx` — the entire UI + streaming logic.
- `app.json` — native config: the `@mentra/bluetooth-sdk` plugin, build
  properties, and Android/iOS permissions. **Don't delete the plugins block.**
- `eas.json` — build profiles (preview + production both output an APK).
- `package.json`, `tsconfig.json` — known-good versions from the official example.

## Where to set your stream target
Open `src/BroadcasterScreen.tsx` and edit the CONFIG block near the top:
```ts
const STREAM_KEY = 'fancast-1';
const ENDPOINTS = {
  rtmp:   `rtmp://157.245.208.49:1935/live/${STREAM_KEY}`,
  webrtc: `https://peak.streampal.fun:8444/${STREAM_KEY}/whip`,
};
```
(Later you can replace this with a Supabase lookup by client slug — same
pattern Peak Broadcaster already uses.)

## Build it (cloud, no local machine needed)
1. Create a new empty GitHub repo and add these files to it.
2. Link the repo to an EAS project. Either run `eas init` once from any machine
   with the EAS CLI, OR connect the repo in the Expo dashboard's GitHub
   integration. This adds `extra.eas.projectId` to `app.json`.
3. Trigger an Android build with the **preview** profile (dashboard "Build" or
   `eas build -p android --profile preview`). EAS compiles in the cloud and
   gives you an APK to download.
4. Install the APK on your phone (or sideload to a Fire tablet).

## Test
1. Open the app, tap **Connect Glasses** (the glasses must already be on Wi-Fi).
2. Pick RTMP or WebRTC, tap **Go Live**.
3. RTMP playback: `http://157.245.208.49:8888/fancast-1/index.m3u8`
   WebRTC playback: your WHEP viewer at `https://peak.streampal.fun:8444/fancast-1/whep`.

## Notes
- `production` is set to output an APK (for sideloading). If you list it on the
  Play Store, change the production profile's `buildType` to `app-bundle`.
- The `stream_status` event's exact field names aren't documented; the handler
  reads them defensively. Log one event the first time you go live to confirm.
- Auto-connects to the first Mentra Live found — fine for a single-operator kit.
