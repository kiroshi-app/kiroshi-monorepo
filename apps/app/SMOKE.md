# Smoke checklist — real Claude Code

Run before tagging a release. Every step here exercises something the automated
suite cannot reach: a signed-in binary, the network, a packaged bundle, or the
macOS quit sequence.

## Preconditions

- A real `claude` on `PATH`, signed in. Check with `claude --version`.
- `unset KIROSHI_CLAUDE_BIN`. A leftover export from an E2E session silently
  points the live tests and the app at the fake binary, and everything below
  passes against a stub that never talks to the network.
- Quit any running `bun run dev` first. `tauri.dev.conf.json` overrides only
  `bundle.icon`, so the identifier, the single-instance lock and the data
  directory are shared with the packaged app — the two builds fight over both.
- Store paths, both under `~/Library/Application Support/com.kiroshi.app/`:
  `conversations.sqlite3` holds the transcript the app reads and writes, and
  `session.json` is the legacy file the first launch imports once and never
  writes again.

## Signing

`bun run tauri:build` on its own ad-hoc signs the bundle. To sign it with the
Developer ID, put the identity in the environment:

```
APPLE_SIGNING_IDENTITY="Developer ID Application: Steve Puget (BBE5V2JL5H)" bun run tauri:build
```

The identity stays out of the committed config on purpose: a personal
certificate name is not shared property. Tauri reads `APPLE_SIGNING_IDENTITY`,
enables the hardened runtime on its own, and signs every nested executable —
`kiroshi-agent` and `kiroshi-claude` first, then `kiroshi-app`, then the
bundle. Confirm both:

```
APP=apps/app/src-tauri/target/release/bundle/macos/Kiroshi.app
codesign --verify --deep --strict --verbose=4 "$APP"
codesign -d --verbose=4 "$APP" 2>&1 | grep -E "flags|Authority"
```

→ `valid on disk`, `flags=0x10000(runtime)`, and an `Authority` chain ending at
`Apple Root CA`. Anything else and the bundle is not signed with the Developer
ID, whatever the build log claimed.

`--deep` covers the nested executables, but not what the hardened runtime does
to them. Check them on their own:

```
AGENT="$APP/Contents/MacOS/kiroshi-agent"
codesign -dv "$AGENT" 2>&1 | grep -E "Identifier|TeamIdentifier"
codesign -dv "$APP/Contents/MacOS/kiroshi-claude" 2>&1 | grep -E "Identifier|TeamIdentifier"
"$AGENT" --probe
```

→ `Identifier=kiroshi-agent` with a `TeamIdentifier`, a `TeamIdentifier` on
`kiroshi-claude` too, then one line of JSON. A probe that names a path instead
means the provider executable did not land beside the sidecar.
`Identifier=a.out` and no team means the binary kept the ad hoc signature bun
gives it, which Apple will not notarize. A `SharedArrayBuffer is not defined`
crash means `bundle.macOS.entitlements` lost `com.apple.security.cs.allow-jit`,
which the hardened runtime needs to leave the JavaScriptCore JIT enabled — a
failure that only ever shows up in a signed build, never in `bun run dev`.

**Signing is not notarization.** A signed bundle is still refused by Gatekeeper:
`spctl --assess --type execute "$APP"` answers
`rejected / source=Unnotarized Developer ID` until the bundle has been submitted
to Apple and stapled. That is a separate step run outside this checklist, and no
notarization credential belongs in the repo.

## Steps

1. `bun run --filter app test:live`
   → the four `#[ignore]`d live tests pass.

2. Build signed (see **Signing** above), then
   `ls apps/app/src-tauri/target/release/bundle/macos/Kiroshi.app/Contents/MacOS/`
   → **exactly** `kiroshi-app`, `kiroshi-agent` and `kiroshi-claude`.
   `fake_claude` next to them means the feature gate regressed.

3. Open the `.dmg` from
   `apps/app/src-tauri/target/release/bundle/dmg/`, drag to `/Applications`,
   launch.
   → first launch needs right-click → Open: the bundle is not notarized, so
   Gatekeeper refuses a double-click whether it is ad-hoc or Developer ID
   signed. On a Mac that received the `.dmg` over the network, the fix is
   `xattr -dr com.apple.quarantine /Applications/Kiroshi.app`.

4. Read the header.
   → the real CLI version is shown and the status dot is ready. A missing
   version means the app resolved no binary.

5. Send `Remember the number 4271.`
   → the reply streams in token by token, not as one block.

6. Ask it to write a file, e.g. `Write "hello" to /tmp/kiroshi-smoke.txt`.
   → a permission card appears; Allow once; the activity row turns green.

7. Send a long prompt (`Count from 1 to 300, one number per line.`) and press
   Stop mid-stream.
   → the turn ends cancelled and the composer is usable again.

8. Cmd+Q, then `pgrep -fl claude`.
   → prints nothing. **This is the only check that covers the `RunEvent::Exit`
   wiring.** No automated test can reach it: the suite runs under `MockRuntime`,
   which never emits `RunEvent::Exit`, so the whole `terminate_session` path on
   quit is unverified until this step runs.

9. Relaunch.
   → every message of the session above is back, read from
   `conversations.sqlite3`, in order and each exactly once — including the
   stopped reply from step 7, which comes back stopped rather than as a message
   still being written. Ask `What number did I ask you to remember?`
   → the bot **does** know, and nothing about the transcript moves while it
   answers: no message is repeated, hidden or reordered, and the question
   appears once. The Claude session that heard the number is gone — this launch
   started a fresh one — and what it is answering from is the conversation
   rebuilt out of `conversations.sqlite3` and carried in its first prompt.

10. Send `Count from 1 to 500, one number per line.` and quit with Cmd+Q while
    it is still streaming, then relaunch.
    → the partial reply is there with the words it had reached, marked stopped.
    Nothing is left looking like a message still being written.

11. Scroll up a transcript longer than 20 messages, with the trackpad, then
    with Page Up from the focused transcript.
    → before the top is reached, a skeleton row shows above the oldest message
    and the older page lands there on its own, without a click and without
    moving the row being read. Keep scrolling up: each page loads in turn, and
    once the beginning is reached `Beginning of the conversation` shows. No
    message appears twice and none is skipped.

12. Quit, then `echo '{' > ~/Library/Application\ Support/com.kiroshi.app/session.json`
    and relaunch.
    → the transcript is unchanged and there is no crash: nothing reads that file
    any more once the import has run, and the import never destroys bytes it
    cannot parse.

## Orphan-group check

Run before quitting, then again after. The second run must print nothing but
the header.

```
APP_PID=$(pgrep -x Kiroshi); CLAUDE=$(pgrep -P "$APP_PID" -f claude)
PGID=$(ps -o pgid= -p "$CLAUDE" | tr -d ' ')
ps -o pid=,ppid=,pgid=,command= -g "$PGID"
```

Repeat the pair for each way out of the app:

- Cmd+Q
- the red close button
- Force Quit from Activity Monitor

## Known limitations

- Every UI check here is manual because nothing automates it: `e2e_session.rs`
  stops at the Tauri command layer and never mounts React, and `tauri-driver`
  has no macOS support — WKWebView exposes no WebDriver endpoint.
- `kill -9` on the app leaves the process group behind. `SIGKILL` is
  uncatchable, so no handler runs — this is not a failure of the shutdown path.
- A WKWebView content-process crash is not covered. Tauri v2 exposes no portable
  hook for it.
- Real Claude Code **mints a new session id on `--resume`**, so the id a restart
  within one launch carries is legitimately a different one. That is the resume
  chain working, not a bug — the check is that the answer carries on, never that
  the id is stable.
- A **relaunch rebuilds the model's context rather than resuming it**: Claude is
  started fresh, and the first prompt of every run it never answered in carries
  the conversation reconstructed from the database — the bot's instructions and
  memory, the summary of what was folded away, the messages since it, an older
  message the prompt explicitly answers, and the prompt. Step 9 asserts that as
  the behaviour it is, so that whoever changes it has to change the checklist
  too.
- The reconstruction is **bounded**, so a conversation far longer than step 5's
  will not come back word for word: only the most recent stretch does, and
  everything before it through the summary a checkpoint folded. What a long chat
  loses in detail is expected, not a failure of the recovery.
- **Rotation is invisible by design and has no control of its own**, so nothing
  here drives one on purpose. It happens under the reader — at the preventive
  threshold, or once a provider session is refused or stops answering — and the
  only thing to check is what step 9 checks: the chat carries on and the
  transcript does not move.
