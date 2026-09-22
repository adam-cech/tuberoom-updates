# TubeRoom 1.2 — stock WLED edition

A local Mac controller for five WLED tubes. The Mac sends configuration commands; WLED does audio analysis and generates the lights. No firmware is installed, patched or replaced. No npm dependencies.

## Install this update

In the existing app: Updates → Check for updates → Install & restart. Alternatively, choose `latest.tuberoom-update.json` with Install update file. Stop and restore the lights first. Connections and 2D layout migrate from 1.1; existing primary/accent colors become group colors. The first effect after migration is Fixed. Reopen `Start-TubeRoom.command` for normal use, then visit http://127.0.0.1:8788 in Safari.

## First show

1. Connect Mac and tubes to the dedicated router.
2. Setup → enter/discover each IP → assign Group A or B → Check & save. Pixel counts and installed effects are read from each controller.
3. Choose the source tube in the Microphone selector and click Connect. This reads the existing AudioReactive configuration, preserves mic type/pins/gain, configures one sender and the remaining compatible tubes as receivers, and restarts changed controllers. A physical microphone must already work in WLED. Missing/locked/incompatible AudioReactive support is reported; firmware is never installed to fill the gap.
4. Choose a group, effect, brightness and colors. Start lights. Changes while running are applied with Apply groups.
5. Closing Safari, hiding its tab, sleeping the Mac or closing the launcher leaves the lights running. Blackout turns reachable enabled tubes off. Stop & restore returns the prior basic WLED state. A previously running WLED playlist may need to be restarted manually.

## Included effects and honest limits

| App effect | Installed WLED effect / behavior |
|---|---|
| Fixed | Solid; one RGB color |
| Fade | Fade; two colors |
| Pulse | Breathe; foreground/background |
| Scroll | Chase 2; within each tube, not a fixture-to-fixture chase |
| Rainbow | Colorloop; generated hues |
| Strobe | Strobe; timed, not audio-triggered |
| Color loop | Onboard playlist of up to 12 ordered RGB colors; timed, not beat-triggered |
| Sound pulse | Plasmoid; sound-gated flowing pattern |
| Sound flashes | Puddlepeak; sound-triggered patches, not a full-tube beat strobe |
| Sound ripples | Ripple Peak |
| Sound center | Gravcenter |
| DJ color | DJ Light; generated RGB based on frequency content |

Effects are resolved by name against the actual device effect list, never hardcoded numeric IDs. Effects missing on any checked member of a group are marked unavailable. Starting rechecks all enabled tubes. Each group has independent settings; normal WLED notification sync is disabled during the show so groups cannot overwrite each other. Sharing microphone analysis is separate from normal state sync.

No universal frequency-range filter is offered: stock WLED's range controls in Freqmatrix/Freqwave map frequency to hue, and peak-driven receivers consume the sender's peak flag. Claiming independent frequency triggers from these controls would be misleading. Sound sensitivity/intensity controls are shown where the selected effect supports them. Microphone gain/noise floor/AGC remain available through a direct link to WLED settings.

Custom beat-by-beat color sequences, exact synchronized full-tube audio strobe, room-position-driven effects and precisely coordinated fixture chases are not implemented without additional firmware or a computer lighting engine. Sharing sound does not guarantee frame-locked animations; random effects and timed playlists may drift between tubes.

## Colors and room preview

The RGB wheel includes hex and 0–255 channel fields, preset swatches, ordering controls and a color preview. Run pure red/green/blue/white tests in Setup. Wrong primary colors normally require correcting LED type/color order in WLED; the app does not guess or overwrite these settings. Keep the WLED power limiter enabled. RGBW white channels are not directly controlled. Screen and physical LED colors can differ.

The 2D editor supports drag, rotation, length, reversal and line/fan/ring/scattered layouts. Position is a visual guide, not spatial input to stock effects. Optional Live samples reads `/json/live` up to twice per second while visible. Unsupported/offline/stale tubes are clearly represented as color guides, not simulated live output. Preview polling does not generate lighting frames or analyze audio.

## Presets and recovery

Timed color loops reserve only unused preset IDs 200–250 after reading `presets.json`. User presets are not overwritten. Each generated preset has a session-specific name, is verified after saving, and is removed on Stop only if the name still matches. Sessions and restore snapshots persist locally, so Stop & restore remains available after restarting TubeRoom. Unreachable-device restoration failures remain recoverable by retrying Stop.

Microphone changes preserve a local backup of only AudioReactive settings (not Wi-Fi credentials). Failed routing changes attempt rollback. Setup → Restore previous microphone settings restores the first saved mic configuration. Routing changes persist on the tubes; they do not revert on ordinary Stop.

User data is in `~/Library/Application Support/TubeRoom`. App update packages replace only app files and preserve this folder. The supervisor can recover from a failed app update.

## Development and validation

Run `node --test test/*.test.mjs`. The suite exercises five mock WLED devices through actual HTTP, verifies independent RGB/effect state, microphone sender switching and rollback, zero DDP traffic, no heartbeat dependency, restart recovery, preset ownership, blackout, live samples, old-settings migration, UI behavior and app-update rollback.

The browser API harness is not a Safari renderer. No physical tubes or real Mac Safari session were available here. Verify microphone response, LAN multicast delivery, real colors, controller firmware compatibility and viewport fit on the actual rig before relying on the show.

Build a compatible update with `node scripts/build-update.mjs updates/latest.tuberoom-update.json "Release notes"`. Published feed: https://raw.githubusercontent.com/adam-cech/tuberoom-updates/refs/heads/main/latest.tuberoom-update.json

Implementation references: official WLED v0.15.1 JSON API, AudioReactive usermod and effect source; BTAir User Manual Rev. 1 for the simple effect categories. The WLED configuration schema is version dependent. The app checks for the AudioReactive schema it understands and fails explicitly if unavailable.
