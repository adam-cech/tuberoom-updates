# TubeRoom 1.2.1 — stock WLED edition

A local Mac controller for five WLED tubes. WLED performs audio analysis and renders the lights. For the optional beat color loop, the Mac receives the selected tube’s peak flags and sends each color change; other effects run autonomously on WLED. No firmware is installed, patched or replaced. No npm dependencies.

## Install this update

In the existing app: Updates → Check for updates → Install & restart. Alternatively, choose `latest.tuberoom-update.json` with Install update file. Stop and restore the lights first. Connections and 2D layout migrate from 1.1; existing primary/accent colors become group colors. The first effect after migration is Fixed. Reopen `Start-TubeRoom.command` for normal use, then visit http://127.0.0.1:8788 in Safari.

## First show

1. Connect Mac and tubes to the dedicated router.
2. Setup → enter/discover each IP → assign Group A or B → Check & save. Pixel counts and installed effects are read from each controller.
3. Choose the source tube in the Microphone selector and click Connect. This reads the existing AudioReactive configuration, preserves mic type/pins/gain, configures one sender and the remaining compatible tubes as receivers, and restarts changed controllers. A physical microphone must already work in WLED. Missing/locked/incompatible AudioReactive support is reported; firmware is never installed to fill the gap.
4. Choose a group, effect, brightness and colors. Start lights. Changes while running are applied with Apply groups.
5. Closing Safari or hiding its tab is fine. Beat color loops need the launcher running and the Mac awake; otherwise they hold the last color. Other onboard effects keep running independently. Blackout turns reachable enabled tubes off. Stop & restore returns the prior basic WLED state. A previously running WLED playlist may need to be restarted manually.

## Included effects and honest limits

| App effect | Installed WLED effect / behavior |
|---|---|
| Fixed | Solid; one RGB color |
| Fade | Fade; two colors |
| Pulse | Breathe; foreground/background |
| Scroll | Chase 2; within each tube, not a fixture-to-fixture chase |
| Rainbow | Colorloop; generated hues |
| Strobe | Strobe; timed, not audio-triggered |
| Color loop | Up to 12 ordered RGB colors, advancing on tube-detected beats via the Mac relay; optional onboard timer |
| Sound pulse | Plasmoid; sound-gated flowing pattern |
| Sound flashes | Puddlepeak; sound-triggered patches, not a full-tube beat strobe |
| Sound ripples | Ripple Peak |
| Sound center | Gravcenter |
| DJ color | DJ Light; generated RGB based on frequency content |

Effects are resolved by name against the actual device effect list, never hardcoded numeric IDs. Effects missing on any checked member of a group are marked unavailable. Starting rechecks all enabled tubes. Each group has independent settings; normal WLED notification sync is disabled during the show so groups cannot overwrite each other. Sharing microphone analysis is separate from normal state sync.

No universal frequency-range filter is offered: stock WLED's range controls in Freqmatrix/Freqwave map frequency to hue, and peak-driven receivers consume the sender's peak flag. Claiming independent frequency triggers from these controls would be misleading. Sound sensitivity/intensity controls are shown where the selected effect supports them. Microphone gain/noise floor/AGC remain available through a direct link to WLED settings.

Beat color sequences are supported through the optional Mac relay. Exact synchronized full-tube audio strobe, room-position-driven effects and precisely coordinated fixture chases remain unsupported. Sharing sound does not guarantee frame-locked animations; random effects and timed playlists may drift between tubes.

## Beat color loop

Choose a group → Color loop → On each beat. Set and reorder the colors, connect your chosen tube microphone, then Start lights (or Apply groups if already running). New selections default to beat mode; old saved timed loops retain their timer until you switch them.

The Mac subscribes to WLED Audio Sync multicast `239.0.0.1` on the selected sender’s configured audio port (usually 11988). It accepts only 44-byte v2 packets with the `00002` header from that tube’s IP, and uses the reported peak flag. No Mac microphone, FFT, guessed BPM, scheduled beats or timer fallback is used. Closely spaced flags within 180 ms are suppressed to reduce double hits. WLED’s built-in detector identifies sound peaks; it may not match every musical beat.

A valid received trigger moves each beat-enabled group forward by one entry, wrapping independently through its own color list. Commands go to that group’s tubes concurrently. Non-beat groups are untouched. No presets are written in beat mode. Slow requests are serialized; pending changes collapse to the latest beat index to avoid an ever-growing late queue, so a congested or unreachable tube can miss a displayed color. Delivery failures appear in the UI.

Silence or lost audio packets holds the last color. Starting without a valid sender stream fails with connection guidance instead of silently substituting simulated audio. The display reports stream status, tube trigger count and current color index. After restarting the launcher, an existing beat session stays paused until Resume beat relay is clicked. Stop/Blackout drains in-flight beat writes before restoring/switching off, so a delayed command cannot relight a tube afterward.

Beat mode requires the Mac awake and the launcher running. Safari does not need to stay open or in front. This is the explicit exception to the otherwise autonomous onboard playback; controller firmware remains unchanged. The optional timer uses WLED playlists and continues without the Mac.

## Colors and room preview

The RGB wheel includes hex and 0–255 channel fields, preset swatches, ordering controls and a color preview. Run pure red/green/blue/white tests in Setup. Wrong primary colors normally require correcting LED type/color order in WLED; the app does not guess or overwrite these settings. Keep the WLED power limiter enabled. RGBW white channels are not directly controlled. Screen and physical LED colors can differ.

The 2D editor supports drag, rotation, length, reversal and line/fan/ring/scattered layouts. Position is a visual guide, not spatial input to stock effects. Optional Live samples reads `/json/live` up to twice per second while visible. Unsupported/offline/stale tubes are clearly represented as color guides, not simulated live output. Preview polling does not generate lighting frames or analyze audio.

## Presets and recovery

Timed color loops reserve only unused preset IDs 200–250 after reading `presets.json`. User presets are not overwritten. Each generated preset has a session-specific name, is verified after saving, and is removed on Stop only if the name still matches. Sessions and restore snapshots persist locally, so Stop & restore remains available after restarting TubeRoom. Unreachable-device restoration failures remain recoverable by retrying Stop.

Microphone changes preserve a local backup of only AudioReactive settings (not Wi-Fi credentials). Failed routing changes attempt rollback. Setup → Restore previous microphone settings restores the first saved mic configuration. Routing changes persist on the tubes; they do not revert on ordinary Stop.

User data is in `~/Library/Application Support/TubeRoom`. App update packages replace only app files and preserve this folder. The supervisor can recover from a failed app update.

## Development and validation

Run `node --test test/*.test.mjs`. The suite exercises five mock WLED devices through actual HTTP, verifies independent RGB/effect state, microphone sender switching and rollback, zero DDP traffic, no heartbeat dependency, restart recovery, preset ownership, blackout, live samples, old-settings migration, UI behavior and app-update rollback. Real UDP packets additionally verify beat-only advances, silence/no-input hold, source-IP filtering, malformed and duplicate packet rejection, independent group wrapping, no preset writes, safe stop during an in-flight command, lost-stream recovery and explicit resume after restart.

The browser API harness is not a Safari renderer. No physical tubes or real Mac Safari session were available here. Verify microphone response, LAN multicast delivery, real colors, controller firmware compatibility and viewport fit on the actual rig before relying on the show.

Build a compatible update with `node scripts/build-update.mjs updates/latest.tuberoom-update.json "Release notes"`. Published feed: https://raw.githubusercontent.com/adam-cech/tuberoom-updates/refs/heads/main/latest.tuberoom-update.json

Implementation references: official WLED v0.15.1 JSON API, AudioReactive usermod and effect source; BTAir User Manual Rev. 1 for the simple effect categories. The WLED configuration schema is version dependent. The app checks for the AudioReactive schema it understands and fails explicitly if unavailable.
