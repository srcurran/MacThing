# Car Thing → Mac Now Playing

Turns a Spotify Car Thing into a Now Playing display and volume knob for macOS.
It follows whatever is playing, as shown in Control Center's Now Playing: Apple Music, Spotify, Podcasts, YouTube in a browser, and so on.

| Control | Action |
|---|---|
| Turn knob | Mac output volume |
| Press knob | Play / pause (starts Apple Music if nothing is playing) |
| Top button 1 / 2 | Previous / next track |
| Top buttons 3, 4, back, settings | Unassigned; see `bridge/config.js` |

The screen shows the artist, title, album, elapsed and total time, and artwork.
It also has a "nothing playing" state (with a clock), a paused state, a volume readout, an app badge for non-Music sources (for example, a browser playing YouTube), and a "Waiting for your Mac" screen.

## What you need

- **A Mac** running macOS 15.4 or later (developed on macOS 27), with the Xcode command-line tools (`xcode-select --install`).
- **Node 22 or later.**
- **adb:** `brew install android-platform-tools`.
- **A Car Thing with ADB access**, meaning community-modified firmware such as the Thing Labs / DeskThing image based on Spotify's 8.9.2. Plug it in by USB and check that `adb devices -l` lists `product:spotify-car-thing`.

## Setup (once)

```bash
git clone https://github.com/srcurran/carthing-now-playing.git
cd carthing-now-playing
npm run build          # compiles the Swift helpers and the MediaRemote adapter, then self-tests it
npm run setup-device   # makes the Car Thing boot into this UI (reversible; see "Undo")
npm run install-agent  # starts the bridge now and at every login
```

That's it. The Car Thing switches to the Now Playing screen within a few seconds.

## Launching

The Car Thing is only a display. The work happens in the **bridge**, a small Node program on your Mac (`bridge/main.js`). It reads Now Playing and the volume, and drives the Car Thing over USB. The Car Thing shows "Waiting for your Mac" whenever the bridge isn't running.

### Automatically at login (recommended)

`npm run install-agent` installs a per-user LaunchAgent at `~/Library/LaunchAgents/com.carthing.bridge.plist`. macOS then starts the bridge when you log in and restarts it if it ever exits. There's nothing to open or keep running yourself. Unplugging, replugging or rebooting the Car Thing is handled automatically.

```bash
npm run status          # is it running?
npm run logs            # follow the log (~/Library/Logs/carthing-bridge.log)
npm run restart         # restart it, e.g. after pulling updates
npm run uninstall-agent # stop it and remove it from login
```

The agent records the absolute path of the `node` you installed it with. If you later remove that Node version (for example with nvm), run `npm run install-agent` again.

### Manually

```bash
npm start       # runs in the foreground; Ctrl-C to stop
npm run dev     # same, plus: redeploys ui/ to the device on every save and logs raw knob/button events
```

Don't run a manual copy while the agent is running, because both would fight over the device. Run `npm run uninstall-agent` first, and `npm run install-agent` when you're done.

### After pulling updates

```bash
npm run build     # only needed if native/ changed
npm run restart   # the bridge pushes any UI changes to the Car Thing by itself
```

## Customizing

Edit `bridge/config.js`, then `npm run restart`. You can change:

- `buttons`: what each hardware button does
- `volumeStep`: volume change per knob click
- `knobDirection`: set to `-1` if clockwise turns the volume down
- `idlePlayApp`: which app the knob press starts when nothing is playing
- `macVolumeIndicator`: see below

**macOS volume pop-up.** By default the knob sets the volume directly. The Sound menu reflects the change, but macOS doesn't show its volume pop-up. To get the pop-up, set `macVolumeIndicator: true`, restart, and allow `native/bin/volumectl` under **System Settings → Privacy & Security → Accessibility**. The knob then presses the Mac's volume keys. macOS requires that permission for any software that generates keystrokes. A physical keyboard doesn't need it because its keys come from hardware.

## Undo

```bash
npm run uninstall-agent   # remove the login item
npm run restore-device    # put Spotify's original web app and config back, then reboot the Car Thing
```

## How it works

```
Mac                                                         Car Thing (USB)
────────────────────────────────────────────                ─────────────────────────────────
bridge/main.js (Node, no npm deps)
 ├─ Now Playing ← /usr/bin/perl + MediaRemoteAdapter        Chromium 69 kiosk
 │               (streams JSON; also sends play/next/…)       file:///…/webapp/index.html
 ├─ Volume     ⇄ native/bin/volumectl (CoreAudio)             → symlink → /var/lib/carthing/ui
 ├─ App badges ← native/bin/appinfo (name + icon)             ui/app.js
 └─ Device link ── adb forward tcp:22222 → tcp:2222 ──────▶     (Chromium devtools port)
      Mac → page: Runtime.evaluate(__carthingReceive(msg))
      page → Mac: __carthingSend(json) (Runtime.addBinding)
      UI sync: adb push ui/ → /var/lib/carthing/ui when its hash changes
```

The page on the device never touches the network. The Mac drives it over the Chrome DevTools Protocol.
Buttons and the knob reach the page as ordinary `keydown` (`1`–`4`, `Enter`, `Escape`, `m`) and `wheel` (`deltaX` ±53 per click) events, and the page forwards actions to the Mac.
`npm run screenshot out.png` captures what the device is showing.

## The device

The device this was built on runs Spotify's final firmware, `v8.9.2`, community-modified:

- root `adbd` plus an RNDIS gadget (`/etc/init.d/S49usbgadget`)
- Chromium 69 kiosk run by supervisord with `--remote-debugging-port=2222`
- Weston compositor
- 32-bit userland on a 64-bit kernel, 512 MB RAM

`npm run setup-device` changes two things, and `npm run restore-device` reverts both:

- `/usr/share/qt-superbird-app/webapp` becomes a symlink to `/var/lib/carthing/ui`. Spotify's original is kept as `webapp.spotify`.
- Spotify's background app (`qt-superbird-app`) no longer autostarts. It was using about 15% CPU on wake-word listening and Bluetooth pairing. The original config is kept as `/etc/supervisord.conf.spotify`.

### Gotchas

- **Never run `adb reverse`.** It crashes this adbd, the USB gadget unbinds, and the device disappears from USB until it's power-cycled. That's why everything goes Mac → device.
- macOS has no RNDIS driver, so the device's USB network interface is unused.
- The kernel has no USB HID gadget driver, so the Car Thing can't simply act as a USB media-key device.
- The device clock is never set, so the idle clock uses the Mac's time and timezone.
- Userland is 32-bit, so a raw `input_event` is 16 bytes, not 24. This matters only if you read or inject `/dev/input/event*` yourself.
- The UI must be plain ES2017 and CSS that Chromium 69 supports: no `?.`, `??`, flex `gap`, `inset`, `aspect-ratio` or `clamp()`.

## Known limitations

- **Now Playing relies on a workaround.** Since macOS 15.4, Apple only lets its own entitled processes read MediaRemote. [ungive/mediaremote-adapter](https://github.com/ungive/mediaremote-adapter) gets around this by running inside `/usr/bin/perl`, which Apple signs. `npm run build` self-tests it. A future macOS update could break it. An AppleScript fallback for Music.app would be the plan B, and `bridge/nowplaying/mediaremote.js` documents the interface such a source would implement.
- **Only one source at a time.** Control Center can list several players; this shows the one macOS considers current.
- **Browser video artwork is low resolution.** YouTube only exposes a small thumbnail. It's shown letterboxed over a blurred fill.
- **Non-Latin scripts.** The device has no CJK font, so Japanese, Chinese or Korean titles render as boxes. Adding a Noto Sans CJK subset to `ui/fonts` would fix it.
- **Volume depends on the output device.** HDMI, S/PDIF and some USB DACs have no software volume. The screen then says "No volume control on …".
- **Deliberate design deviation.** The progress bar is 2px rather than the mockup's 1px, because 1px is a hairline on the device's roughly 230 ppi screen.

## Layout

```
bridge/           Mac-side Node app (config.js: buttons, volume, knob direction…)
  nowplaying/     MediaRemote source, artwork re-encoding (sips → ≤480px JPEG), app names/icons
  audio/          volumectl wrapper
  device/         adb, minimal CDP client, UI sync, connection lifecycle
native/           Swift helpers + build script (output in native/bin, git-ignored)
ui/               everything that runs on the Car Thing (800×480)
scripts/          device setup/restore, screenshot, LaunchAgent
vendor/           mediaremote-adapter source (cloned by native/build.sh, git-ignored)
```

## Credits

- [ungive/mediaremote-adapter](https://github.com/ungive/mediaremote-adapter) (BSD-3-Clause), cloned and built by `npm run build`.
- [Inter](https://rsms.me/inter/) by Rasmus Andersson (SIL Open Font License), bundled in `ui/fonts`.
