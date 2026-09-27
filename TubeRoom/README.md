# TubeRoom 3.0 — five bars, one native WLED remote

A fresh interface around the controls already on your five WLED bars. Select one bar, an arbitrary selection, a group, or all five; choose a native effect; change brightness, colors, palette and effect controls. WLED performs audio processing and renders effects. The app sends settings only when you change something. No firmware changes, pixel streaming or Mac microphone capture.

## Upgrade without reinstalling

In TubeRoom 1.2.x, use **Stop & restore**, then **Updates → Check for updates → Install & restart**. The existing Mac launcher still works. Your bar addresses, names, enabled status and group assignments import into v3. Nothing is sent to the lights just by opening the app. V3 reads the actual WLED state, rather than restoring an old effect automatically.

V3 stores its preferences separately in `settings-v3.json` and scenes in `scenes-v3.json` in the existing TubeRoom application-support folder. Older preferences and session files remain intact. **Settings → Update source & recovery → Restore previous app** rolls back the app. The source of the previous release is also retained on branch `stable-v1.2.3`.

For a fresh installation, download the source folder and double-click `Start-TubeRoom.command`. It installs its own Node runtime if needed, then opens Safari at `http://127.0.0.1:8788`. This requires internet only for the first runtime download and online app updates; lighting control is local. The updated source launcher lets the Mac sleep; an older installed launcher may still keep it awake until closed.

## Everyday use

1. **Connect bars**: enter WLED IP addresses or scan the current local network. Assign Group A/B and rename them if desired. Save & connect checks every enabled bar. Existing microphone routing is preserved.
2. **Choose your bars**: click bar cards to toggle an arbitrary selection, or select all connected slots / either group. Offline bars remain visibly offline; reconnect them before normal multi-bar changes.
3. **Find a look**: browse or search effects reported by all selected controllers. The paginated grid keeps the main screen compact. Audio-reactive and matrix effects are marked from firmware metadata. A matrix effect may not suit a one-dimensional bar. Native sound effects require the right WLED build and working microphone configuration.
4. **Make it yours**: sliders apply when released. Only the changed control is sent. If bars have different values, the UI shows Mixed. Picking one effect does not overwrite unrelated colors, brightness or segment boundaries. Effect metadata determines which controls are useful; Solid only shows its primary color.
5. **Save a scene**: captures current settings for the selected bars, including different effects/colors per bar. Recalling affects those recorded bars, not the current selection. Up to 12 scenes live in TubeRoom; controller preset slots are untouched. Custom palettes absent from WLED's named palette list cannot be saved in app scenes; use WLED for those.

**Turn off** targets the selection. **All off** attempts every configured, enabled bar even if another is unreachable. Delivery failures are reported per bar. Closing Safari or the launcher does not stop native WLED effects.

## What this first v3 includes

- Five independent bars, arbitrary multi-selection, two named groups.
- Native power, brightness, transitions, installed effects and built-in palettes.
- Three native RGB slots when used by the effect; system color picker, hex, channel fields and color swatches.
- Native speed/intensity, extra effect parameters and options when reported by firmware; reverse/mirror controls.
- Scene capture and recall across multiple bars, with settings stored per bar and segment.
- Actual-state polling; optional `/json/live` sampled-pixel preview. The default five-bar display is a color guide, not simulated effect playback. Unsupported/stale live samples fall back to that guide.
- Manual IP connection, local subnet discovery, status reporting, update installation and rollback.
- Sky-blue/black desktop layout using available viewport height, with compact breakpoints and paginated effects. Mobile layouts scroll. Dialogs and the saved-scene list can scroll when needed.

## Deliberate boundaries

This is a native-control foundation, not every WLED settings page. Hardware configuration, LED count/color order, segment editing, built-in controller presets/playlists, RGBW/CCT and microphone routing remain in each bar's WLED UI. **Connect bars → Open**, or **More effect controls → Open in WLED**, gets you there. Native audio effects are available if installed; v1's custom bass/beat relay and draggable room layout are not included in this reset.

Controls target all existing active segments on each selected bar without changing their boundaries. Commands match effects and palettes by name across firmware builds. Sharing settings is not frame-locked effect synchronization; random effects and different segment geometry may look different. Palette choice and effect algorithms determine how RGB colors appear, and screen colors cannot calibrate physical LEDs.

Normal WLED notification send and receive groups are disabled on bars receiving app commands so group changes do not spread outside the selection. This persists on the controller until changed in WLED Sync settings. Audio sync is a separate mechanism and is not changed. The app never changes Wi-Fi, microphone pins, firmware, LED wiring or WLED preset files.

## Failure handling and validation

Before normal commands, read every target and validate support on all targets. If a read or capability check fails, send no changes. Once sending begins, independent network requests can still partially fail; the UI names those bars rather than pretending the change was atomic. All-off bypasses preflight and sends concurrently to all configured enabled bars. If clicked during another action, it runs immediately after that action completes.

The server binds to loopback, validates the Host and browser Origin, requires a session token for writes, limits request sizes and accepts only private IPv4 device addresses. Public addresses, duplicate IPs and arbitrary WLED commands are rejected. Developer loopback mocks require explicit `TUBEROOM_TEST=1`.

Run `node --test test/*.test.mjs`. Tests cover five mock controllers with different effect/palette ordering and multiple segments, group isolation, RGB slot preservation, offline preflight, partial write failure, all-off, scenes, setup migration, legacy preference preservation, startup/rollback, update integrity, and UI behavior. The UI harness is not a browser layout engine. Real Safari viewport rendering and physical WLED hardware were unavailable; verify fit, sound behavior and actual colors on the rig.

Build the seven-file in-app package with `node scripts/build-update.mjs updates/latest.tuberoom-update.json "Release notes"`.

References: [official WLED JSON API and effect metadata](https://kno.wled.ge/interfaces/json-api/) and WLED v0.15.1 `wled00/json.cpp` / effect source. Firmware capabilities and APIs vary; the app resolves available effect and palette names from each device.
