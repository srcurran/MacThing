# Notes for coding agents

## Device visual test: once per PR, not per change

`node scripts/verify-device-ui.js` takes over the Car Thing: it cycles through every screen with
fixture data and then reloads the page. People usually use the device while they work, so:

- Don't run it after each tweak. While iterating, `npm run dev` redeploys to the device on every
  save, and it reopens the screen and view you were on, so check the change there.
- Run it once, just before opening or updating a PR.
- Ask before running it ("Is now a good time for the device test?") and wait for a yes. It
  interrupts whatever is on the screen.

`npm run mock-screens` (the README screenshots) and `scripts/util/art-compare.js` also drive the device, so ask
before running them too.

## Visual checks with ohsee: as often as you like

ohsee compares every screen of the UI as it is on `origin/main` ("prod") with this checkout
("dev"), at the device's 800×480, and says what changed: text, colors, spacing, layout. It runs in
its own headless Chromium with fixture data (`ohsee/screens.js`), never on the Car Thing, so unlike
the device test it needs no one's permission and can run after every change.

Setup, once per session:

1. Start the servers in the background: `npm run ohsee:serve`. It builds main's UI once (cached
   in `.ohsee/baseline/`) on :4861 and rebuilds this checkout's UI on every save on :4862.
2. The `ohsee` MCP server comes from `.mcp.json`. Its tools are `ohsee_run`, `ohsee_get_report`,
   `ohsee_get_screenshot`, `ohsee_accept_changes` and `ohsee_save_evidence`.

While working on anything that touches `ui/`:

- After each meaningful edit, call `ohsee_run` (about 25 s for all 11 screens). Fix every change
  the task didn't ask for, and look at suspicious ones with `ohsee_get_screenshot` (side `diff`).
- Record changes the task asked for with `ohsee_accept_changes`, with a reason a reviewer can
  check against the task. Never accept a change just to make a run come out clean.
- A new screen or state that `ohsee/screens.js` doesn't reach isn't checked. Add it there (the
  snapshot order must stay the same on prod and dev).

Before opening or updating a PR that changes how the UI looks:

1. Run `ohsee_run` once more, then `ohsee_save_evidence` with
   `imageBaseUrl: "https://github.com/srcurran/MacThing/blob/<branch>/.ohsee/evidence"`.
2. Commit `.ohsee/evidence/` and `ohsee.accepted.json`, and put `.ohsee/evidence/summary.md` in the
   PR description.
3. If the verdict is `needs-human-approval`, say so at the top of the PR: the visual changes are
   waiting for the owner to approve them, and the PR shouldn't be merged before that. If it is
   `needs-fixes`, fix the unexpected changes first.
4. Then the device test above, once, with permission.

A PR that changes nothing visible should come out `clean`; its evidence is a picture of each screen.

CI runs the same check on every PR that touches the UI (`.github/workflows/visual.yml`): it fails
on any change not in `ohsee.accepted.json`, and comments the summary on the PR, with intended
changes marked as awaiting approval. So a PR whose visual changes were all accepted passes, and
merging it is how the owner approves them. To reproduce a CI failure locally, run
`npm run ohsee:serve` and then `npm run ohsee -- --fail-on-changes`.
