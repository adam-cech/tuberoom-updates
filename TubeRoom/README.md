# TubeRoom 1.2.2 — stock WLED edition

A local Mac controller for five WLED tubes. WLED performs audio analysis and renders the lights. For the optional beat color loop, the Mac filters the selected tube’s reported bass levels (or peak flags) and sends each color change; other effects run autonomously on WLED. No firmware is installed, patched or replaced. No npm dependencies.

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
| Color loop | Up to 12 ordered RGB colors, advancing on strong bass hits via the Mac relay; optional onboard timer |
| Sound pulse | Plasmoid; sound-gated flowing pattern |
| Sound flashes | Puddlepeak; sound-triggered patches, not a full-tube beat strobe |
| Sound ripples | Ripple Peak |
| Sound center | Gravcenter |
| DJ color | DJ Light; generated RGB based on frequency content |

Effects are resolved by name against the actual device effect list, never hardcoded numeric IDs. Effects missing on any checked member of a group are marked unavailable. Starting rechecks all enabled tubes. Each group has independent settings; normal WLED notification sync is disabled during the show so groups cannot overwrite each other. Sharing microphone analysis is separate from normal state sync.

Color loop can filter the tube’s low-bass data, with independent group thresholds. Other onboard effects have no universal frequency-range filter: stock WLED's range controls in Freqmatrix/Freqwave map frequency to hue, and peak-driven receivers consume the sender's peak flag. Claiming independent frequency triggers from these controls would be misleading. Sound sensitivity/intensity controls are shown where the selected effect supports them. Microphone gain/noise floor/AGC remain available through a direct link to WLED settings.

Beat color sequences are supported through the optional Mac relay. Exact synchronized full-tube audio strobe, room-position-driven effects and precisely coordinated fixture chases remain unsupported. Sharing sound does not guarantee frame-locked animations; random effects and timed playlists may drift between tubes.

## Bass-triggered color loop

Choose a group → Color loop → Big bass hits → Tune bass trigger. Set and reorder the colors, connect your chosen tube microphone, then Start lights (or Apply groups if already running). New color loops and saved 1.2.1 beat loops default to bass mode. Saved timed loops keep their timer. Every tube peak restores the original behavior.

The default Big hits preset uses a 55% threshold and a 0.65-second minimum gap. If it still changes too often, try Only the biggest (75%, 1 second). More hits uses 35% and 0.3 seconds. Each group has independent settings. The recent bass peak meter helps with tuning; percentages are relative to WLED’s reported levels, not decibels. Mic placement, gain and WLED automatic gain control affect them. Apply bass settings saves changes without restarting the current color sequence.

The Mac receives the selected tube’s already-computed FFT bands and filters the first three low-bass bands. A trigger needs a strong rise above recent background, above your threshold, after the minimum gap. Bass must settle before a new hit can trigger. Sustained bass cannot advance the loop when the gap expires. A brief learning period after startup or a stream interruption avoids treating reconnection as a hit. Exact frequency coverage depends on the WLED build. This detects prominent low-bass hits, not specifically a kick instrument or a musical drop.

The relay subscribes to WLED Audio Sync multicast `239.0.0.1` on the selected sender’s configured port (usually 11988). It accepts only 44-byte v2 packets with the `00002` header from that tube’s IP. Every tube peak mode uses the reported peak flag with a 180 ms minimum gap. No Mac microphone, Mac FFT, guessed BPM, scheduled beats or timer fallback is used. The tube performs sound capture and FFT; the Mac performs trigger filtering and color-command delivery.

An accepted trigger advances only the qualifying group by one entry, wrapping through its own color list. Commands go to its tubes concurrently. No presets are written in sound-triggered mode. Slow requests are serialized; pending changes collapse to the latest index to avoid an ever-growing late queue, so a congested or unreachable tube can miss a displayed color. Delivery failures appear in the UI.

Silence or lost audio packets holds the last color. Starting without a valid sender stream fails with connection guidance. The display reports stream status, accepted hit count per group and current color index. After restarting the launcher, an existing sound-triggered session stays paused until Resume beat relay is clicked. Stop/Blackout drains in-flight writes before restoring/switching off.

Sound-triggered color loops require the Mac awake and the launcher running. Safari can close. This remains the exception to otherwise autonomous onboard playback; controller firmware is unchanged. The optional timer uses WLED playlists and continues without the Mac.

## Colors and room preview

The RGB wheel includes hex and 0–255 channel fields, preset swatches, ordering controls and a color preview. Run pure red/green/blue/white tests in Setup. Wrong primary colors normally require correcting LED type/color order in WLED; the app does not guess or overwrite these settings. Keep the WLED power limiter enabled. RGBW white channels are not directly controlled. Screen and physical LED colors can differ.

The 2D editor supports drag, rotation, length, reversal and line/fan/ring/scattered layouts. Position is a visual guide, not spatial input to stock effects. Optional Live samples reads `/json/live` up to twice per second while visible. Unsupported/offline/stale tubes are clearly represented as color guides, not simulated live output. Preview polling does not generate lighting frames or analyze audio.

## Presets and recovery

Timed color loops reserve only unused preset IDs 200–250 after reading `presets.json`. User presets are not overwritten. Each generated preset has a session-specific name, is verified after saving, and is removed on Stop only if the name still matches. Sessions and restore snapshots persist locally, so Stop & restore remains available after restarting TubeRoom. Unreachable-device restoration failures remain recoverable by retrying Stop.

Microphone changes preserve a local backup of only AudioReactive settings (not Wi-Fi credentials). Failed routing changes attempt rollback. Setup → Restore previous microphone settings restores the first saved mic configuration. Routing changes persist on the tubes; they do not revert on ordinary Stop.

User data is in `~/Library/Application Support/TubeRoom`. App update packages replace only app files and preserve this folder. The supervisor can recover from a failed app update.

## Development and validation

Run `node --test test/*.test.mjs`. The suite exercises five mock WLED devices through actual HTTP, verifies independent RGB/effect state, microphone sender switching and rollback, zero DDP traffic, no heartbeat dependency, restart recovery, preset ownership, blackout, live samples, old-settings migration, UI behavior and app-update rollback. Real UDP packets additionally verify beat-only advances, silence/no-input hold, source-IP filtering, malformed and duplicate packet rejection, independent group wrapping, no preset writes, safe stop during an in-flight command, lost-stream recovery and explicit resume after restart. Bass tests cover weak/treble rejection, sustained-hit suppression, cooldown, stream reconnection, independent group thresholds and tuning without a color reset.

The browser API harness is not a Safari renderer. No physical tubes or real Mac Safari session were available here. Verify microphone response, LAN multicast delivery, real colors, controller firmware compatibility and viewport fit on the actual rig before relying on the show.

Build a compatible update with `node scripts/build-update.mjs updates/latest.tuberoom-update.json "Release notes"`. Published feed: https://raw.githubusercontent.com/adam-cech/tuberoom-updates/refs/heads/main/latest.tuberoom-update.json

Implementation references: official WLED v0.15.1 JSON API, AudioReactive usermod and effect source; BTAir User Manual Rev. 1 for the simple effect categories. The WLED configuration schema is version dependent. The app checks for the AudioReactive schema it understands and fails explicitly if unavailable.
