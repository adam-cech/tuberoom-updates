# TubeRoom 4.0 — sound lives on the tubes

V4 follows the supplied sketch: five tubes and an A/B/C group matrix on the left; a five-bar preview above effects; an always-visible RGB color disc, basic colors, brightness and effect controls on the right. Scenes and in-app updates remain available. Native sound capture, analysis and animation run entirely inside WLED, including when the Mac is asleep or disconnected.

## Sound Brightness — no firmware change

Select your tubes → **Sound Brightness ♫** → choose a color. The full length of each active segment gets brighter and dimmer together, rather than showing a changing number of LEDs. **Minimum glow** (default 8%, adjustable 1–50%) sets the dim level between sounds; global Brightness caps the overall output. A black chosen color or power/brightness set to zero still turns the LEDs dark.

This configures an existing WLED effect, not newly uploaded effect code. The native **Juggles** effect blends from background to foreground using the tube's smoothed volume. Grouping all physical LEDs in a segment into one logical pixel makes that volume response uniform. The **Color 1** palette keeps the selected hue steady. A dim version of that same RGB color becomes the background. No audio data is sent to the Mac and no recurring brightness commands are generated there.

It responds to overall sound level, not specifically kick drums. Compared with Noisemeter it uses smoothed volume rather than Noisemeter's raw-volume length calculation. The response depends on WLED's mic gain, noise floor, AGC, output limits and sound source. This is a practical stock-effect configuration for the requested behavior, not a bit-for-bit rewrite of Noisemeter.

Requirements are checked on every selected tube: enabled AudioReactive, installed Juggles effect, the built-in Color 1 palette, and existing segments of at most 255 physical LEDs each (100-LED bars qualify). Failed checks do not silently substitute simulated audio. Grouped multi-segment bars retain their boundaries; each segment responds as a unit.

### Restoring the normal spatial effects

TubeRoom saves the previous grouping, spacing, offset, mirror/mapping, palette and background before activating Sound Brightness. Choose another effect **through TubeRoom** to restore those values. This restoration works after restarting the app and when recalling scenes. If you change effects directly in WLED, its grouping remains in place; switch through TubeRoom or restore grouping manually in WLED. App rollback is blocked while grouping restorations are outstanding, with a message explaining how to restore first.

The restoration file is `profiles-v4.json` in the existing application-support folder. Keep it alongside your settings. If a controller's segment boundaries change externally, restore its grouping in WLED rather than blindly applying old geometry. No segment boundaries, LED count, wiring or firmware are altered by this mode.

## Noisemeter and Beat Pulse are different

**Noisemeter ♫** remains the original onboard WLED volume-to-length effect. Its Width and Fade rate parameters appear as supplied by the firmware. It measures overall sound energy, so a full bar is not proof of a kick.

**Beat Pulse ♫** is shown as **Firmware required** on stock WLED. The proposed strong-hit threshold, release/rearm and kick filtering cannot be installed as an app-only preset. V4 does not implement it using a Mac microphone, network-audio processing, timer, or a misleading alias for another effect. A future compatible tube firmware must expose both the Beat Pulse effect and a verified TubeRoom capability marker before V4 will enable it. No such firmware binary is included or flashed in this release.

## Groups, color and scenes

- Select one or several tube-name buttons, All five, or a group button.
- A/B/C radio dots assign each tube to exactly one group. Group membership changes only the saved app configuration, not current lighting.
- Choose a color on the RGB disc or a basic swatch, select a supported color slot, then click Apply color. RGB / hex opens exact channel entry.
- Stock WLED has up to three RGB slots per effect. The fourth slot in the sketch is shown disabled; unused slots are also disabled. Effects that generate their own colors may ignore RGB input. Palette and transition controls are under More effect controls.
- Save current creates a local scene for the selected tubes. Recalling targets those recorded tubes. Sound Brightness mode, minimum glow and per-segment colors are retained by scenes.
- The default preview is a clearly labeled color guide. Live samples optionally reads actual WLED pixels. Neither preview method drives the LEDs or processes audio.

Changes are checked across all selected tubes before sending. Independent requests may still partly fail once sent; the app reports those failures. All off attempts every configured enabled tube even if another is offline. Native effects are not guaranteed to be phase-locked across controllers.

Normal WLED state notification send/receive groups are disabled on controlled tubes to prevent changes spreading to unselected groups. Audio sync configuration is separate and remains untouched. Each tube can process its local mic, or receive audio data processed by another WLED tube, according to its existing AudioReactive configuration. No sound input or FFT runs on the computer.

## Upgrade

From v3: **Settings → Check for updates → Install & restart**. From v1.2: Stop & restore first, then use its Updates dialog. Existing launcher and update URL remain valid; no reinstall is needed.

V4 imports existing IPs, names, group A/B assignments and scenes. Group C starts empty. New settings/scenes use `settings-v4.json` / `scenes-v4.json`, leaving previous versions intact. Source recovery branches preserve prior releases. Hardware settings and controller presets remain in the native WLED interface, available through Connect bars → Open.

For a fresh installation, double-click Start-TubeRoom.command and visit http://127.0.0.1:8788. Network discovery scans only a private IPv4 subnet connected to the Mac. The Node runtime is downloaded only if needed on the first launch. Online updates require internet; lighting control does not.

## Validation and limits

Run `node --test test/*.test.mjs`. Tests cover setup migration, three-group UI behavior, native-effect mapping, capability checks, Sound Brightness grouping and minimum-glow commands, original geometry restoration after restart, scene recall, five simulated WLED controllers, offline/partial failures, update integrity and rollback. These verify application behavior and command structure; they are not physical audio/LED tests.

The implementation was checked against official WLED v0.15.1 `mode_juggles`, `mode_noisemeter` and JSON source. Real tubes and Safari viewport rendering were not available. Compact desktop breakpoints are implemented, but actual response and screen fit still need checking on the user's setup. No flashable firmware is provided or required for Sound Brightness.

Reference: [WLED JSON API, grouping and effect metadata](https://kno.wled.ge/interfaces/json-api/). Source logic: WLED v0.15.1 `wled00/FX.cpp`, `mode_juggles` (clamped smoothed volume blend) and `mode_noisemeter` (raw volume mapped to length).

Build the update: `node scripts/build-update.mjs updates/latest.tuberoom-update.json "Release notes"`.
