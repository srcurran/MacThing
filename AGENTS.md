# Notes for coding agents

## Device visual test: once per PR, not per change

`node scripts/verify-device-ui.js` takes over the Car Thing: it cycles through every screen with
fixture data and then reloads the page. People usually use the device while they work, so:

- Don't run it after each tweak. While iterating, `npm run dev` redeploys to the device on every
  save, and it reopens the screen and view you were on, so check the change there.
- Run it once, just before opening or updating a PR.
- Ask before running it ("Is now a good time for the device test?") and wait for a yes. It
  interrupts whatever is on the screen.

`npm run mock-screens` (the README screenshots) also drives the device, so ask before running it too.
