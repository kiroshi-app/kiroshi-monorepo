## Launch

With the installed Kiroshi open, from the repo root:

```
cargo run --release --manifest-path apps/rune-preview/Cargo.toml
```

The onboarding comes first. Its last step opens the conversation tab on the installed Kiroshi, with its longest conversation open. The flag in the rail opens the open missions. The installed Kiroshi is only read: sending, and opening, updating or closing a mission, never leave the preview.

## Stage 2 verdicts

| Surface | Verdict |
|---|---|
| Dithered avatars | Holds |
| Longest real conversation, KaTeX included | Holds with a workaround: inline maths is a wrapping flow of words and typeset formulas |
| Multi-line input | Holds |
| Mission thread | Holds |

**Dithered avatars: holds.** A Rust port of `companion-avatar.ts`, `companion-field.ts`, `companion-silhouette.ts`, `field-grid.ts` and the glaze of `outlined-hexagon.tsx`: name seed, ASCII-glyph silhouette, honeycomb clipped to the rounded hexagon, error diffusion, hue jitter, ink and ground colours. A test pins the tones of three names, still and at 600 ms of thinking, to the strings main's TypeScript produces. Pairs at 2x are identical cell for cell in both themes. The field is drawn with Rune `canvas` shapes, so no rasterising. A still frame shows while the agent has no running turn. While a turn runs (from `turnChanged`, `activity`, `message*` up to `turnEnded`), the field animates with main's activity kinds (thinking, searching, working, writing) through a frame clock in `poll` (`Tx::wake_after(0)`). Reduce Motion keeps the still frame, as main does.

**Longest real conversation: holds with a workaround.**
- **Finding it.** The conversation tab looks for the longest conversation by message count, through the host API only. A message's `seq` is per conversation, so a one-message page per conversation bounds every count. Exact counts then run in descending order of bound, until no remaining bound can beat the best. On Steve's host: 283 conversations, the longest has 2,778 messages, found in 1.5 s.
- **What that conversation holds.** It has 53 tables, 31 mermaid diagrams and 49 code blocks, but no display maths and no image. It has one inline formula: a remark-math accident, "2,19 $/mois + volume 0,15 $/Go", which main typesets too and the preview typesets the same way.
- **Maths.** It is typeset by `katex-native`, KaTeX's own layout and fonts in Rust, rasterised through resvg into a Rune `Pixels` image at 2x. Main's maths stories (`MarkdownMath` Default and Inline) pair glyph for glyph.
- **Missing primitive.** Rune's text has no inline box for an arbitrary element: inline boxes exist only for mention pills. The workaround: a line carrying `$…$` becomes a flex-wrap row of words and formula images, each formula set on the 16 px baseline of a 24 px line. That line loses inline Markdown emphasis and selection across the line, and joins no soft-wrapped neighbour.
- **Tables.** Formulas inside tables stay as TeX source, because rune-kit's table cells take text only.

**Multi-line input: holds.**
- **Growth.** The prompt is Rune's raw `text_input` under `auto_grow(1, 8)`: 24 px lines, eight at most, then it scrolls with the caret kept in view. Main's `MAX_ROWS` is 8. When the text no longer fits beside the send button (measured on a hidden single-line mirror, as main does), the field takes the whole row and send wraps below. The radius goes 25 → 24, or 20 with attachments, and the border goes from 10 % to 20 % with content or focus.
- **Keys.** Enter sends, Shift+Enter breaks a line. With the menu open, Up and Down move, Enter or Tab inserts the pill, Escape closes.
- **Mention menu.** It is drawn as main's `prompt-mention-menu.tsx`: 300 px panel, 14 radius, "Agents" heading, 36 px rows with 22 px dithered avatars and plain titles. With no query: the conversation's six first agents and the "Keep typing to reach the other N in {space}" footer. While typing: "Not in this conversation" with "Add to this conversation".
- **Paste.** A paste holding only an image becomes main's attachment chip (thumbnail, `image.png`, size in main's units, remove button). Pasted text goes to the field.
- **Checked headlessly.** Scripts typed ten lines, `@`, `@e` plus Down, `@e` plus Enter, and pasted a PNG.

**Mission thread: holds.**
- **Where missions show.** The rail's flag lists `mission_board`. A mission opens its thread: `MissionHeader` (back, 24 px avatar with the attention dot, objective, state pill, ticket band with platform mark, tools, status and "opened …", then the commits and PR line), then the thread conversation's messages with the mission events between them as machine lines or authored bubbles, then "Answer this mission…". A conversation that opened missions shows each one as main's `MissionTurn` card where it was opened. Clicking the card opens the mission.
- **Live updates.** `mission://changed` from the host socket updates the pill and the running state at once, then rereads `mission_detail`. The read-only check heard one live change on the OPE-1933 mission within 30 s.

## Stage 3 measures

`python3 apps/rune-preview/bench/measure.py` writes `bench/results.json` after each measure, so a late failure keeps what was taken (`complete` turns true at the end): every run, its machine load (`os.getloadavg()` before and after) and the tool. Each measure runs three times, the table gives the median. Last run: Mac18,5, 12 cores, 24 GiB, macOS 27.0.1, screen unlocked, 1-minute load 6.0 to 8.8 (agents were working on the machine).

| Measure | Tool, the same on both sides | Kiroshi | Preview |
|---|---|---|---|
| Cold start, first frame | `open -n` on a bundle, then the pid's first window in `CGWindowListCopyWindowInfo` | 517 ms (Kiroshi Dev) | 254 ms (`--dev-host`) |
| Cold start, conversation displayed | `screencapture -l` of that window, read by Vision until the last word of the last message shows | 2,013 ms (Kiroshi Dev, ±246 ms) | 567 ms (`--dev-host`, ±170 ms) |
| Memory | `footprint`, Kiroshi plus its WebKit helpers against the preview, agents excluded | 2,501 MiB (installed) | 106 MiB |
| CPU at rest | `ps` CPU time of both process sets over the same 60 s, both at once | 68.9 % of a core (installed) | 33.7 % of a core |
| Scroll frame times | none | Not measured | Not measured |
| Key press to glyph | none | Not measured, by decision | Not measured, by decision |

**Cold start.** Kiroshi Dev's release bundle against the preview, on "Bench: long conversation" (2,778 messages, written by `bench/fabricate.py` into Kiroshi Dev only). Kiroshi Dev starts its own host and opens the conversation from a tab the bench restores. The preview starts against Kiroshi Dev's host, already running, and finds the longest conversation itself. The installed Kiroshi is never quit. The ± is the median gap between two captures, so the true moment lies up to that much before the number. Kiroshi Dev's three runs spread from 1,101 to 2,531 ms, the preview's from 567 to 668 ms.

**Memory and CPU at rest.** The installed Kiroshi, left as Steve uses it (running for four days, two windows, its longest conversation open: 2,778 messages), against a preview launched fresh onto the same conversation, read-only. Neither side is touched during the 60 s.
- Memory: the installed runs read 2,499, 2,508 and 2,501 MiB, the preview runs 72, 107 and 106 MiB. `results.json` keeps the sums, not the split per process.
- CPU at rest is not at rest on either side while an agent works. The preview ran 33.7 and 38.6 % in the first two runs, while agents worked on the machine, likely the avatar field it animates while a turn runs (not profiled). In the third it was 0.9 %. The installed side stayed between 67 and 73 % in all three.

**Why scroll isn't measured.** No synthetic scroll ever reaches the installed Kiroshi, so the same scroll can't run on both sides. Accessibility isn't granted to the shell either.

**Tauri cost centres.** From an xctrace Time Profiler recording (`--all-processes`, 20 s) of Kiroshi Dev opening the bench conversation: 4.4 s of CPU across Kiroshi Dev and its WebKit helpers, self time by process and leaf binary.
1. WebContent, JavaScriptCore: 1,960 ms, 45 %. Regular expression compilation first (`Yarr::CharacterClassConstructor`), then garbage collection (`JSFinalObject::visitChildren`).
2. WebContent, WebCore: 343 ms, 8 %. Style resolution: CSS custom properties (`CustomPropertyData::forEachInternal`) and applying the matched properties.
3. Kiroshi, the kernel: 267 ms, 6 %. Mach messages, then `chmod`.

On a locked screen, an earlier run sampled 2.3 s: WebKit throttles painting for a window nobody sees.

## Read-only on the installed Kiroshi

On the installed profile, `Host::invoke` refuses any command outside `space_list`, `conversation_bots`, `conversation_page`, `conversation_list`, `conversation_message_page`, `account_state`, `mission_board`, `mission_detail` and `mission_list`. It returns `WriteRefused` before a request leaves, and a test proves `conversation_send_turn`, `conversation_main_chat` and `mission_close` never reach the socket. Enter on the installed host keeps the draft and says sending is off there. Sending stays proven on Kiroshi Dev (`--smoke-send`).

`--smoke-read` connects to the installed host, finds and loads the longest conversation, loads one mission thread with its events and its conversation's missions, and listens 30 s for `mission://changed`. It then prints every command it sent and exits non-zero on any write. Last run: 329 requests, 0 writes. The preview opens no file of `com.kiroshi.app` other than `host/token`. The Kiroshi app's own log isn't read, for that reason. The request ledger above stands in for it.

## Host transport

HTTP `POST /api/invoke/{command}` and the `/api/events` WebSocket of the Kiroshi host, with a bearer token. No change to apps/app, packages/ui or the host.

- Conversation tab: the host of the bundled `Kiroshi.app/Contents/MacOS/Kiroshi`, found among the listening processes, with the token of `com.kiroshi.app/host/token`. A local image path under a Kiroshi data folder is refused and shown as a placeholder.
- Onboarding: reads the Kiroshi Dev profile when it runs (`agent_account`, `claude_import_inventory`, `account_state`).
- `--smoke-send <text>`: Kiroshi Dev only. `--smoke-read`: the read-only check above, which also prints the longest conversation's title for the bench.
- `--dev-host` opens the conversation tab on Kiroshi Dev, `--skip-onboarding` on the installed Kiroshi, both without the onboarding.

## Crates added beyond Rune

- Stage 2: `katex-native` 0.1.1 with `raster` (MIT, KaTeX fonts under OFL, about 0.5 MB embedded). It brings `katex-rs` 0.3 and `resvg` 0.45 with text.
- Stage 1: `ureq` 2 (host calls, image fetches), `tungstenite` 0.29 (event socket), `serde` and `serde_json` (payloads), `uuid` 1 (message and turn ids), `rune-motion` (same Rune rev, the spinner).

Geist and Geist Mono (OFL, vercel/geist-font v1.9.1) are embedded from `assets/fonts`.

## Gaps left, by surface

- **Avatars.** The attention dot is a plain 8 px dot in the primary colour, not `BotBadgeDot`.
- **Conversation.**
  - Mermaid in rune-mermaid uses main's neutral and dark theme colours and 16 px type, but draws straight edges with labels beside the line, where mermaid.js curves them and sits the label on the line. Labels are in Geist, not Trebuchet.
  - Tables have main's 14 px cells, 12×8 padding, 5 % header, 10 % rules and 15 % outline, but no vertical column rules and rune-kit's corner radius instead of 14.
  - The longest conversation has no display maths, so display maths is proven on main's `MarkdownMath` story source.
- **Input.**
  - No lead crown in the menu: the preview doesn't read the lead.
  - The preview doesn't upload pasted images: sending with an attachment says so and keeps the draft.
- **Missions.**
  - The missions list in the rail is a plain list, not main's `MissionsPanel` (not part of this stage).
  - Event links (`url`, `pullRequest`) aren't drawn.
  - Mission turns are placed before the first message created after them, where main places them after the run that opened before them.
  - Activity rows use the "working" kind, as main's header does.
  - Live `mission://changed` events are heard while the preview runs; a mission listed before is refreshed only on that event.

## What Rune doesn't draw, and its placeholder

- Tabs: one plain pill with the open conversation's name, where the tab strip sits.
- Space avatar state badge: not drawn.
- Conversation subject icons: always the message glyph, in the conversation's hue.

## Decisions taken alone

- Components are built from Rune primitives where rune-kit's look differs from main. rune-kit gives Markdown, syntax colouring, mermaid and the paste and pill plumbing of text fields.
- Measurements come from the packages/ui stories rendered in Chromium, compared with Rune headless scenes at 1180x780, at 2x for avatars and maths.
- Space, agent and avatar colours use a port of `hue-recipe` `toneOf`. A test pins four preset tones to the CSS tokens.
- The roster is `conversation_page` (pinned first, then by activity), as main. The longest conversation opens once found. If the search fails, the first conversation with an agent opens and the failure shows above the prompt.
- Threads of 40 rows or fewer anchor at the bottom without virtualisation. Longer ones are virtualised over one row list mixing messages, mission turns and mission events. A thread loads up to 10,000 messages.
- Roster dates older than four weeks are formatted in UTC.
- The import step advances without importing. The sign-in steps show their screens without completing.
- Headless scenes `live`, `live-mission` and `live-mission-turn` read the installed host before the first frame. `live-mission-turn` ends the conversation just after its first mission so the card is in view.

## kiroshi-core (OPE-1954)

The kept core of `apps/app/src-tauri` moves to a crate with no Tauri dependency, in four steps: the kept modules move off `AppHandle` and `State` onto a `Core` context inside src-tauri; they move into `crates/kiroshi-core`; the preview reads and sends through it in-process; a three-OS CI job builds the preview and runs its smoke test.

### Decisions

- **Core.** A cheap clonable handle holding the data folder, the app identifier, the tokio runtime, a typed registry of shared state, an event channel and the frame relay of the host API. The registry is append-only: a second insert of a type returns false and keeps the held value, nothing removes or replaces one, which is what makes `Managed<'_, T>` sound.
- **Events.** A payload is serialised once to raw JSON, so its bytes stay exactly as the command layer wrote them. Tests subscribe to the channel without Tauri. The Tauri app installs a listener that forwards to every window or to one window.
- **Window-keyed state.** Turn windows, mission run claims and library presence are keyed by an opaque `ClientId`. Core exposes `clear_client`. The Tauri app maps a window label to a `ClientId`; the Rune shell will use one fixed `ClientId`. No Tauri type crosses into Core.
- **Desktop port.** Opening a URL goes through a `Desktop` port the Tauri app installs over its opener plugin. Without one, Core returns `NoDesktop`.
- **Left in the Tauri app.** The 238 command wrappers, the host HTTP API, logging (the Tauri log plugin), deep links, and the dialog, clipboard and reveal calls made inside commands.
- **Tests, step 2.** The tests of kept modules move onto a test `Core` (a temporary folder plus the shared test runtime) instead of a Tauri mock app. Tests that go through Tauri IPC stay in the Tauri app, next to the command wrappers they exercise. No test is deleted or ignored.
- **Struct layer in one step.** HostTurn reaches `start_run`, `start_run` builds every Host implementor, and those reach the routine Runner and the webhook. The graph is strongly connected, so the structs moved onto `Core` together rather than one per commit.
- **Commands called from kept code.** Such a command becomes a one-line wrapper over a `pub(crate)` Core function (for example `agent_shutdown` over `shut_down_agent`, `routine_create` over `create_routine`). Names, arguments and results are unchanged, and `bindings.ts` regenerates with no diff.
- **Host HTTP API.** `webhook::start` takes the API's routes from the Tauri app. Only the invoke route holds the `AppHandle` it dispatches through.
- **Desktop port.** Raising the main window goes through `Desktop::raise_main_window`. Without a desktop, nothing is raised.
- **Root workspace.** The root `Cargo.toml` holds `apps/app/src-tauri` and `crates/kiroshi-core`, and excludes `apps/rune-preview`, which keeps its own lockfile until step 3. `Cargo.lock` moved to the root unchanged apart from the new crate, and `scripts/release.ts` bumps it there. Builds land in the root `target/`.
- **CI scripts.** `scripts/ci.ts` runs rustfmt with `--all`, and clippy, the library tests and the full Rust test with `--workspace`, so kiroshi-core is linted and tested on every run. `scripts/ci-changes.ts` treats `crates/` as Rust.
- **Step 2 order.** kiroshi-core first holds `Core` and the Tauri-free event primitives (`Event`, `Frame`, `frame`). The kept modules follow module by module: each one's commands move to src-tauri, and its tests move from Tauri mock apps onto a test `Core` in the same commit, so every commit builds and keeps the full test count.
- **Protected files, approved.** `.github/workflows/ci.yml` points the Rust cache at the root workspace and its `target/` (`workspaces: . -> target`). The `test` script in `apps/app/package.json` runs the Rust tests with `--workspace`. `.github/workflows/release.yml` makes the same cache change, approved separately.
- **Contract modules first.** Before any module moves, kiroshi-core takes the types every layer shares: the effort level, the bot permissions, the error enums, and the event table with its payload types. src-tauri re-exports each at its old path, so no call site changes. After that, modules move one at a time (db first), each in a commit that builds.
- **Contracts and storage in one commit.** The contract modules use db's storage types (`Bot`, `Hue`, the joined-space rows), and db uses the contract types. They depend on each other, so they moved to kiroshi-core together. Every contract module moved, along with `json`, the bundles (minus `bundles/host.rs`), avatars, attachments (minus `attachments/commands.rs`), agent's translate, lease, protocol, redact and web_sources, routines' core and filter, and four small utility modules. src-tauri re-exports each at its old path, so call sites didn't change.
- **Types lifted into contracts.** Some contract code pointed at types defined next to logic or commands. Those definitions moved into contract modules, and src-tauri re-exports them at their old paths:
  - from `account::cloud`: the device, member and invitation call errors and the member types;
  - `ApplicationStatus` from `mcp_oauth::status`;
  - `SummonsDropReason` from `conversations::summons`;
  - `FetchRefusal` and `FetchedImage` from `remote_image`;
  - `OauthFlowError` from `agent::sidecar`;
  - the joined-space, mission and routine change events and the agent channels from their command modules;
  - `REFUSED_TO_A_MEMBER` from `host_api::invoke`.

  `From` impls whose types now both live in kiroshi-core moved with them. The ones that convert from a src-tauri type stay in src-tauri.
- **The event table splits.** The 39 events whose payloads live in kiroshi-core are declared there. The 9 window, notification, menu and deep-link events stay in src-tauri, which re-exports kiroshi-core's table. The test that checks every event name is declared once covers both tables.
- **`JoinedSpace::presented`** takes `&impl MemberRelay` instead of the cloud client. src-tauri implements `MemberRelay` for `Cloud`, so callers didn't change.
- **Visibility.** Items src-tauri still reaches are `pub`. `pub(in crate::...)` restrictions keep their original scope inside kiroshi-core, including the `Access` token that gates who can build a repository.
- **Test helpers.** Test helpers that src-tauri's tests use are compiled under `cfg(any(test, feature = "test-support"))`, and src-tauri enables `test-support` as a dev-dependency. Hooks only kiroshi-core's own tests use stay under `cfg(test)`. The integration tests that included `removed_on_drop.rs` by file path now use `kiroshi_core::removed_on_drop`.
- **Assets.** The bundled plugin files are still embedded from `apps/app/src-tauri/plugins` by relative path.
- **Test paths.** Tests moved to kiroshi-core that read files under src-tauri resolve them through a test-only `APP_DIR`. The check that the system plugin's manifest carries the app version reads that version from src-tauri's `Cargo.toml`, because `CARGO_PKG_VERSION` now names kiroshi-core's own version.
- **Building on its own.** kiroshi-core declares its own tokio dev-dependency, so `cargo test -p kiroshi-core` builds without src-tauri.
- **One module per commit.** After the contracts, modules move only once everything they reach is in kiroshi-core: the board model, crypto, the environment store, and the Claude import inventory and sources. A module's `commands.rs` stays in src-tauri under a shadow module (`pub use kiroshi_core::<module>::*;` plus `pub mod commands;`), so `crate::<module>::commands` keeps resolving.
- **Not moved yet, and why.** `mcp_oauth` still reaches `missions::github`, `agent::sidecar` and the Host implementor in `reports.rs`. `claude_import/import.rs` reaches `conversations::commands` and `companions::launch`. Both wait for those modules.
- **Mock-app tests.** Tests that build Tauri mock apps stay in src-tauri next to the commands they exercise, for example `claude_import/tests.rs`. Rewriting them onto a test `Core` is a separate step.
- **Agent host, session and sidecar.** They moved with `logging::stderr_lines`. The `Refusal` impls of the host error types moved beside those types. The sidecar's development lookup still reads `apps/app/src-tauri/binaries`. A kiroshi-core build script exports the target triple that tauri-build used to provide.
- **Where per-module moves stop.** Every file left in conversations and companions has an inline `mod tests` built on Tauri mock apps (`host_turn.rs` alone has 30 uses). So do `agent::commands`, `reply_writer`, `routines::runner` and missions. Inline tests travel with their file and kiroshi-core can't depend on Tauri, so these files can't move until their tests run on a test `Core`.
- **Remaining modules: split, convert, move.** Each remaining module lands as three commits:
  1. The Tauri commands its tests call get a Core function and a thin wrapper.
  2. Its inline tests switch to those Core functions on a test `Core`.
  3. The module moves.

  The split is done for conversations and companions. The test `Core` will be built behind `test-support`: a `Core` over a temporary folder, on a shared multi-thread runtime as Tauri's was. Mock-app helpers in `agent::commands` and `agent::stub_session` that these tests use get Core versions in the same conversion commit.
- **Merge of main.** main is merged in with a merge commit, not a rebase, because the branch is already pushed. After the merge, `git diff origin/main -- apps/app/src/lib/bindings.ts` is empty.
- **Board screenshots.** main's board screenshot opens a hidden render window from the library host, which now holds a `Core`. The `Desktop` port gains `open_render_window` and `close_window`, the Tauri desktop implements them, and the screenshot bookkeeping is Core state.
- **The test `Core`.** `kiroshi_core::test_core` (behind `test-support`) builds a `Core` over its own temporary folder on one shared multi-thread runtime, as Tauri's async runtime was. `listen_to` hands a test each payload of one event, like Tauri's `listen`. Tests call the Core functions the split extracted, not the command wrappers.
- **Tests that keep a Tauri runtime.** They stay in src-tauri:
  - `events::tests::a_page_that_starts_loading_leaves_its_turns_to_the_host_and_a_finished_load_does_not`;
  - `events::tests::a_destroyed_window_leaves_its_turns_to_the_host_and_another_event_does_not`.

  They build a real webview window to check the window events that clear a client, so they moved from `awaited_runs` to `events.rs`, where those handlers live. `TurnWindows::start_driving` and `is_left_to_the_host` became `pub(crate)` for them.
- **Window scenarios in `host_turn`.** Two scenarios closed or reloaded the main window only to clear its client. They now clear the client on the `Core` directly. The window-to-client step is covered by the two `events.rs` tests above.
- **One cycle, one move.** conversations, companions, `agent::commands`, `agent::reply_writer`, `agent::stub_session` and `routines::runner` all import each other, so none of them can move into kiroshi-core alone. Their split and test conversion are done. They move together in one commit, after the edges below are cut. Missions and `mcp_oauth` are in the same cycle through `agent::commands` and `conversations::state`.
- **Edges from that cycle into src-tauri, and how each gets cut:**
  - **Session hosts.** `agent::commands` builds seven Host implementors for every session: routine, mission, companion, standing, application, bundle and library. A `SessionHosts` port in kiroshi-core hands a session its hosts. src-tauri installs it at startup with the hosts that still live there. The library host renders board screenshots in a webview, so it stays in src-tauri behind that port.
  - **`Caller`.** The enum moves to kiroshi-core. Tauri builds it from the invoke headers through `CommandArg`. src-tauri can't implement that trait for a kiroshi-core type (orphan rule), so it keeps a local wrapper that commands take and unwrap. `bindings.ts` doesn't change, because `Caller` has no IPC type.
  - **`authorship::members_of`.** It reads the hosting relay and the account session. It goes behind a members-reader port, or `hosting` moves first.
  - **`missions::commands::observed` and `announce_thread_moved`.** These become Core functions in kiroshi-core's `missions`, in missions' split commit.
  - **`mcp_oauth::refresh`.** It reaches nothing in src-tauri and moves on its own.
- **Session hosts port (done).** `kiroshi_core::agent::host::SessionHosts` hands a session the hosts that live outside kiroshi-core, and `SessionOptions::hosting_all` mounts them. src-tauri's `DesktopHosts` installs six hosts (routine, mission, standing, application, bundle, library) from `events::install_core`, so the app and every mock app get them. The companion host is still mounted directly, because it moves with the cycle. A Core with no hosts installed, such as the test `Core`, runs sessions without those hosts. Hosts are picked by subtype, so their order doesn't matter.
- **`Caller` cut (done).** The `Caller` enum, `RelayedMember` and the pure methods (`is_relayed`, `relayed_account`, `written_from`) are in `kiroshi_core::hosting::caller`. Tauri builds a command's caller from the invoke headers, and src-tauri can't implement `CommandArg` for a kiroshi-core type, so commands take a local `CommandCaller(Caller)`. It derefs to `Caller` and keeps `FunctionArg` returning no type, so `bindings.ts` is unchanged. Tests that call a command directly pass `CommandCaller(Caller::Host)`. `Caller::author` reads the account session and the hosting member lists, so for now it's a src-tauri function, `authorship::author(caller, core, database)`. The authorship port carries it next.
- **Authorship port (done).** `kiroshi_core::hosting::authors::Authors` carries both `members_of` and `author`, because both read the hosting member lists and the account session. src-tauri's `DesktopAuthors` installs it from `events::install_core`, and `agent::commands`, the transcript commands and the library commands call it. A Core with no authors installed, such as the test `Core` or a future Rune preview, writes messages with an empty account author and opens sessions with no member list. That configuration is valid, not an error. The src-tauri functions behind the port stay `pub(crate)`, and the hosting tests still cover them.
- **Mission liveness cut (done).** `observed` and `announce_thread_moved` read `AgentState` and `conversations::state`, both in the cycle, so they can't go to kiroshi-core ahead of it. They left `missions/commands.rs` for `missions/liveness.rs`, together with what they share: `present`, `observed_all`, `announce_change`, `announce_when`, `AnnouncedLiveness` and the change event. That file reaches only the cycle and kiroshi-core, so it moves into kiroshi-core in the shared move. The cycle no longer reaches `missions::commands`.
- **The shared move (done).** The following moved into kiroshi-core in one commit:
  - `conversations` and `companions`;
  - `agent::commands`, `agent::reply_writer` and `agent::stub_session`;
  - `routines::runner` and `missions::liveness`.

  What they reach came with them, because none of it reaches back into src-tauri:
  - `routines::run` and a new `routines::changes` holding `announce_change`;
  - `mcp_oauth::refresh`, `credentials` and `refusal`;
  - `logging::scrub` and `executable_script` (the latter behind `test-support`);
  - a new `library::items` with the library's item resolution (`resolve`, `AcceptedType`, `ResolvedItem`, the library root, `held_document` and `held_document_or_board`). The transcript commands check message documents through it, and src-tauri's library imports it.
- **Commands across the boundary.** Every `#[tauri::command]` of the moved modules stays in src-tauri, in shadow modules (`conversations`, `conversations::commands`, `awaited_runs`, `turn_run_deadline`, `companions::launch`, `agent::commands`). Each shadow re-exports its kiroshi-core module and declares the wrappers.
  - A command that was already one call to a Core function kept its text as is.
  - Every other command left its body in kiroshi-core as a Core function with the command's own name, taking `&Core`. Its wrapper resolves the Core from `State` or the `AppHandle` and delegates. A webview becomes the client id, and `CommandCaller` is unwrapped to `Caller`.
  - Where a command took both an `AppHandle` and the Core `State`, the wrapper keeps only the `State`. The `::<tauri::Wry>` turbofish went from the registry for those 15 commands, and the tests that called them with an app handle now pass only the state.
  - `bindings.ts` and the contract snapshots are unchanged.
- **After the shared move:** the full workspace suite passes `--no-fail-fast` (37 targets, 3,496 passed, 0 failed, 18 ignored as before). `cargo tree -p kiroshi-core -e normal,dev` shows no tauri crate. There are 3,460 test attributes.
- **Webhook handle cut (missions).** The mission commands read their hook URL from the webhook the app manages. The `Webhook` handle (bound address, stop signal, `url`, `origin`, `mission_url`) and the two call paths are now in `kiroshi_core::routines::local_server`. src-tauri's axum server still binds and serves, and builds the handle with `Webhook::new`. `missions::call` stays in src-tauri as that server's mission route, next to `routines::webhook`.
- **Missions tests on a test `Core`.** The `checkout`, `commands`, `github` and `host` tests now run on the test `Core`. Twelve of them started the real webhook server only so that opening or arming a mission could read a hook URL; none of them sends an HTTP call. They now hold a loopback `Webhook` handle (`local_server::a_loopback_webhook`, behind `test-support`). The webhook server itself is still exercised by `routines::webhook`'s and `missions::call`'s tests, which stay in src-tauri.
- **Missions move (done).** `missions::checkout`, `commands`, `github`, `hook` and `host` moved into kiroshi-core. Its ten commands stay in src-tauri as wrappers in the `missions::commands` shadow module; the eight not yet split keep their body as a same-named Core function. src-tauri keeps:
  - `missions::call`, the webhook server's mission route;
  - `missions::run_claims`: its two commands take a webview, and its tests open real windows and run the invoke handler.

  The `HEADER` constant of the webhook moved beside the `Webhook` handle in `routines::local_server`. `github.rs` brought its dependencies with it: `rustls` installs the TLS provider at runtime, and `axum` serves the fake GitHub in its tests (as a dev-dependency). Both use the same specs as src-tauri. `Cargo.lock` gains no package, only the two names under kiroshi-core.
- **mcp_oauth move (done).** `writable_root` moved next to `environment::store::root` in its split commit. `mcp_oauth::asking`, `commands`, `reports` and `status` moved into kiroshi-core, and the four OAuth commands stay in src-tauri as wrappers in a `mcp_oauth::commands` shadow module. All of `mcp_oauth` now lives in kiroshi-core.
- **The app version in kiroshi-core.** The MCP `initialize` sent `env!("CARGO_PKG_VERSION")` as its client version, which in kiroshi-core would be kiroshi-core's `0.1.0`. kiroshi-core's build script now exports `KIROSHI_APP_VERSION`, read from `apps/app/src-tauri/Cargo.toml` and rebuilt whenever that file changes. A test checks the handshake still names the app's version. No other compile-time environment read in kiroshi-core named the app.
- **claude_import/import.rs (done).** It moved into kiroshi-core in one commit. It has no command and no inline tests, so its split and convert steps had nothing to change. src-tauri imports it privately, as it did when it was a private module. `claude_import::commands` and its mock-app tests (`claude_import/tests.rs`) stay in src-tauri.

## Step 3: the Rune preview on an in-process kiroshi-core

- **The in-process Core.** `apps/rune-preview` depends on `crates/kiroshi-core`. `src/local.rs` builds a `Core` on a tokio runtime the preview owns, over a data folder of its own:
  - `KIROSHI_PREVIEW_DATA` if set;
  - otherwise `com.kiroshi.rune-preview` under the platform's data root, so it never writes into the installed app's database.

  It installs the database and the states the conversation path reads (`AgentState`, `TurnRunDeadlines`, `TurnWindows`, `LaunchOutcomeState`). It then runs the app's own launch step, `list_bundles_at_launch`, which lays the plugins down and plants the first companion.
- **The path.** Every call is a kiroshi-core function, with no Tauri, no IPC and no fabricated data:
  - opening the conversation is `main_chat` with the first agent that has a bundle (the planted companion on a fresh profile);
  - sending is `conversation_send_turn`, which summons that agent, as the composer does;
  - reading is `message_page`, followed until the turn's assistant message settles or two minutes pass.

  When no reply settles, the error lists what the thread holds.
- **Where it runs.** `kiroshi-rune-preview --local-send <text>` runs that path with no window and prints the reply, next to the existing `--smoke-send` that goes through a running app's host API.
- **The window on the in-process Core.** The window opens the in-process Core by default. Its data path goes through a `Source`: the in-process Core, or a running Kiroshi behind `--host-api` (or `--dev-host`).
  - The conversation list, a thread, the mission board, a mission detail and the send all go through `kiroshi_core::invoke::dispatch` on that Core. There is no host token read and no HTTP call.
  - Core events reach the window's existing handlers through `core.listen`: agent events, stored messages, mission changes.
  - `--local-send` runs that same window data path headless. It opens the window model, sends with `conversation_send_turn`, and prints the reply from the Core's `MessageCompleted` event; it never polls `message_page`.
  - The host token path and the data folders use the same per-OS root as the in-process data folder: Application Support on macOS, `APPDATA` on Windows, `XDG_DATA_HOME` or `~/.local/share` elsewhere. Their test runs on all three OSes, ungated.
- **Dependencies.** kiroshi-core and tokio (`rt-multi-thread`, already in the tree) are the preview's only new direct dependencies. The preview keeps its own lockfile.
- **The test.** `tests/local_core.rs` runs the preview binary with `--local-send`, with no window, against a throwaway data folder. It checks that the reply settled, that it answers the message sent, and that the exchange landed in the preview's own store. The agent process is src-tauri's `fake_sidecar`: the preview declares that same file as a binary behind a `fake-claude` feature, so both crates share one fake. Run it with `cargo test --features fake-claude`. `libc` (unix) came with that binary.

## Step 4: kiroshi-core and the Rune preview on macOS, Windows and Linux

- **The `core` job.** `.github/workflows/ci.yml` gains a `core` job of its own, run as a matrix over `macos-latest`, `windows-latest` and `ubuntu-latest` with `fail-fast: false`. On each OS it:
  - builds kiroshi-core and runs its tests;
  - builds the Rune preview with `fake-claude` and runs its tests, including the in-process exchange.

  All four commands run with `--locked`. Each OS keeps its own cache of both target folders, saved from `main` only, like the `rust` job.
- **When it runs.** `scripts/ci-changes.ts` selects `core` on changes under `crates/`, under `apps/rune-preview/`, to the fake sidecar the preview builds, or to the workspace `Cargo.toml` and `Cargo.lock`. It runs on pull requests as well as on pushes to main. A `v*` tag never runs it: a tag runs the desktop jobs only, and `release.yml`'s `ci-green` waits on that run, so the preview's three-OS build would hold every release back. `verify` requires `core` to succeed when it was selected and to be skipped otherwise, the same rule as the other filtered jobs.

## CodeQL alerts carried by the move

CodeQL reports three alerts on `ae115e9c0`. They are pre-existing code that the move relocated unchanged: both files are byte-identical to their `origin/main` copies under `apps/app/src-tauri/src`. They stay as they are in this PR and get triaged in their own ticket.

- `crates/kiroshi-core/src/crypto/frame.rs:92`: hard-coded nonce. The line is the zeroed buffer the nonce is built in (`let mut nonce = [0u8; NONCE_LENGTH];`).
- `crates/kiroshi-core/src/mcp_oauth/refresh.rs:266`: cleartext logging, the `eprintln!` reporting that a grant was not refreshed.
- `crates/kiroshi-core/src/mcp_oauth/refresh.rs:269`: cleartext logging, the `eprintln!` reporting that the authorization server refused a refresh.
- **No rustc wrapper in `core`.** `.cargo/config.toml` routes rustc through `.cargo/rustc-wrapper.sh`, a shell script Windows can't execute, so the first Windows run failed before compiling anything. The `core` job sets `RUSTC_WRAPPER: ""`, as `release.yml` does. In CI the wrapper only passes rustc through anyway.
- **Tests gated to unix.** kiroshi-core's tests had never been compiled for Windows. In src-tauri they only ever ran on macOS and Linux, and some test code assumed unix without saying so. That code is now `cfg(unix)`; no test was deleted or ignored, and on Windows the tests below are compiled out:
  - `agent::stub_session` (test-support): its stub agent is an executable shell script written through the unix-only `executable_script`.
  - The tests that hold a session through it: every test in `conversations::host_turn::tests::in_a_session_queue` (already `cfg(unix)`), and `missions::host::tests::a_handoff_answers_while_the_turn_of_its_successor_still_runs`.
  - `bundles::tests::a_turn_git_refuses_reports_the_error_and_is_recorded_once_git_is_repaired` and `bundles::plugin::tests::a_turn_git_refuses_reports_the_error_and_is_recorded_once_git_is_repaired`: they turn a git objects folder read-only through unix permission bits (`read_only_objects`).

  Imports and helpers used only by those tests are gated with them. kiroshi-core's tests and the preview now type-check for `x86_64-pc-windows-gnu` locally with no warning.
- **libxkbcommon on Linux.** The preview binary links `libxkbcommon`, which the Ubuntu runner doesn't ship. kiroshi-core's tests passed there; only the preview's link failed. The `core` job installs `libxkbcommon-dev` on Linux before building the preview. It was the only library the link was missing.

### kiroshi-core's tests on Windows: 86 failures and their causes

Once kiroshi-core's tests compiled on Windows (run 42329567223 on `d718c65d9`), 86 of 1,791 failed. Each cause is fixed where it lives, not per test:

- **Open databases at cleanup (71 tests).** Tests in `catalogue`, `application_installs`, `messages`, `missions::checkout` and `missions::github` removed their temporary folder while their `Database` was still alive. Windows refuses to delete an open SQLite file. Each of those tests now drops its database before the cleanup, which still fails loudly if it can't remove the folder.
- **CRLF checkouts (7 tests).** Through `* text=auto` and the runner's `core.autocrlf`, Windows checked out with CRLF the skills the crates embed, the board fixtures, and the TypeScript sources the mirror tests parse. `.gitattributes` now pins LF for the trees the crates embed or parse: `apps/app/src-tauri`, `apps/app/src/lib`, `apps/app/shared`, `crates`, `packages/shared`, the markdown renderer, `docs/chat/rich-answer-blocks.md` and `.claude/settings.json`. The index was already LF everywhere, and renormalizing changes no file.
- **Bundle repositories followed the machine's git config (1 test).** libgit2 applied the global `core.autocrlf` when it reverted a run, so agent files came back with CRLF. `bundles::git::init` now sets `core.autocrlf = false` in the repositories it creates. That is a product fix: a Windows machine with Git's default config would have rewritten agent memory.
- **`private_files::write` overwrote on Windows (1 test).** Its unix branch creates with `create_new`, but the Windows branch called `fs::write`, so a second launch replaced a person's hand-edited skill. Both platforms now share the `create_new` path. Also a product fix.
- **A unix path in a fixture (1 test).** `avatars::tests::a_sweep_ignores_a_reference_that_points_outside_the_directory` relied on `/etc/passwd`. It now writes a real file outside the avatar folder on every OS.
- **Genuinely unix-only features (5 tests), gated `cfg(unix)` with only the helpers they use:**
  - `missions::hook::tests::the_installed_script_reads_its_config_at_call_time_keeps_the_message_and_exits_zero`, `a_tool_call_carries_the_tool_and_the_target_its_kind_names`, `a_payload_carrying_an_agent_id_sends_no_call` and `the_installed_script_ends_well_when_its_config_names_a_url_nothing_answers`: they run the mission hook the app installs, which is a POSIX shell script.
  - `missions::hook::permissions::tests::the_dev_app_data_is_editable_under_the_expanded_home`: it checks the rule for the dev app's data folder under a unix home (`//<home>/Library/Application Support/...`).

Run 42332394181 on `3a13f7e66`: 2 of 1,786 still failed on Windows, both from one cause.

- **The rich-answer reference was checked out with CRLF (2 tests).** `bundles::system::tests::the_rich_answers_skill_is_preloaded_and_names_every_block_of_the_reference` and `the_rich_answers_skill_states_the_syntax_of_the_reference` split `docs/chat/rich-answer-blocks.md` on `"\n## Blocks\n"`. That file lies outside the trees pinned to LF. It is pinned now, and so is `apps/app/shared`, the only other tree kiroshi-core's tests read. Its JSON parsed either way.

Run 42334518683 on `2493b2914`:
- **kiroshi-core on Windows:** 1,786 passed, 0 failed.
- **The Rune preview on Windows:** 1 of 36 tests failed (34 passed, 1 ignored as before). `host::tests::each_profile_reads_only_its_host_token` checks the path of a running Kiroshi's host token, `$HOME/Library/Application Support/<id>/host/token`. That's the macOS app's home layout, a unix-only feature, and Windows has no `HOME`. It is now `cfg(unix)`.
- **The `rust` job:** it stopped on "No space left on device" while compiling the `bounded_rotation` integration test, after the library tests had passed (1,836). The commit only touched `.gitattributes` and this file, so the build output didn't grow. The next head runs the job again, and that run serves as its one rerun.

## Core commands over HTTP

- `kiroshi_core::invoke` holds the command table for the commands whose functions live in kiroshi-core: `space_list`, `conversation_bots`, `conversation_list`, `conversation_page`, `conversation_message_page`, `conversation_main_chat`, `conversation_send_turn`, `mission_list`, `mission_board` and `mission_detail`.
  - `dispatch` answers each with the JSON Tauri answers for the same command: the result on success, the serialized error on refusal.
  - `router` serves that table over HTTP at the host API's path with no Tauri. A test serves it on a loopback port and checks one write and one read against the Core functions' own results.
- `space_list`'s body moved to `kiroshi_core::spaces::read::list_spaces`, and the Tauri command delegates to it.
- src-tauri's host API answers every command in that table through `dispatch`, behind its existing header, token and size guards.
- `axum` moved from kiroshi-core's dev-dependencies to its dependencies, with the same spec.

## Gaps left

By surface:
- **Host HTTP API.** The core table answers only the ten commands above. Every other command still lives in src-tauri (library, hosting, spaces writes, user, plugins, applications and more), so src-tauri still dispatches it through its hidden webview's IPC. Calls relayed for a space member also stay on that path, because their caller is vouched from src-tauri's hosting state. src-tauri therefore mounts the core table and keeps the webview path for the rest; it doesn't yet mount the core router alone.
- **Window, account rail.** In-process, the rail shows no signed-in account, because the account session lives in src-tauri.
- **Window, onboarding profile.** In-process, onboarding starts from an empty profile. The Claude account, Claude import inventory and other onboarding reads (`dev_profile.rs`) still come from a running Kiroshi Dev, behind `--host-api` or `--dev-host`.


## App skeleton: a kit crate and an app crate (OPE-1966)

`apps/rune-preview` is a Cargo workspace with two members and one `Cargo.lock`. `cargo run --release --manifest-path apps/rune-preview/Cargo.toml` still launches the preview, and the binary keeps its name.

- **`kit/` (`kiroshi-rune-kit`, San).** Pure views over plain data and tokens: `tokens`, `hues`, `icons`, `avatar`, `widgets`, `math`. Depends on rune, rune-kit, rune-motion and katex-native only: no kiroshi-core, tokio, ureq or tungstenite.
- **`app/` (`kiroshi-rune-preview`, Ichi).** `App`, the host client, the source, every core call, the screens, the scenes and the binary. A library (`src/lib.rs`) plus the binary (`src/main.rs`), so a surface's state and the navigation compile before anything reads them.
- **Navigation.** `app/src/navigation.rs`. `App::navigation` holds every open window, its id and its route: the main window, always open, and the secondary windows. `open`, `close`, `navigate` and `navigate_main` are the only writers. `navigate` or `close` on an id that isn't open returns `NavigationError::NotOpen` and changes nothing; closing the main window returns `NavigationError::MainWindowStaysOpen`. An id is never given twice. `Navigation` doesn't open native windows yet: a Rune secondary window is declared before `run` with its own state type, which the first ticket that opens one will wire.
- **Surface state.** `App::surfaces` holds one `State` per surface, so a surface ticket adds its state in its own file without touching `app.rs`.

| Surface | Kit file | App file |
|---|---|---|
| S1 chrome, tabs, tab detach, drag ghost | `kit/src/surfaces/s01_chrome.rs` | `app/src/surfaces/s01_chrome.rs` |
| S2 rail, carousel, Space picker | `kit/src/surfaces/s02_rail.rs` | `app/src/surfaces/s02_rail.rs` |
| S3 roster | `kit/src/surfaces/s03_roster.rs` | `app/src/surfaces/s03_roster.rs` |
| S4 boot, onboarding, notices, bare layouts | `kit/src/surfaces/s04_boot.rs` | `app/src/surfaces/s04_boot.rs` |
| S5 thread | `kit/src/surfaces/s05_thread.rs` | `app/src/surfaces/s05_thread.rs` |
| S6 composer | `kit/src/surfaces/s06_composer.rs` | `app/src/surfaces/s06_composer.rs` |
| S7 approvals | `kit/src/surfaces/s07_approvals.rs` | `app/src/surfaces/s07_approvals.rs` |
| S8 missions | `kit/src/surfaces/s08_missions.rs` | `app/src/surfaces/s08_missions.rs` |
| S9 routines | `kit/src/surfaces/s09_routines.rs` | `app/src/surfaces/s09_routines.rs` |
| S10 agent settings, Skills, History | `kit/src/surfaces/s10_agent_settings.rs` | `app/src/surfaces/s10_agent_settings.rs` |
| S11 Applications, Secrets | `kit/src/surfaces/s11_applications.rs` | `app/src/surfaces/s11_applications.rs` |
| S12 person settings, search | `kit/src/surfaces/s12_person_settings.rs` | `app/src/surfaces/s12_person_settings.rs` |
| S13 Space settings, sharing, join | `kit/src/surfaces/s13_space_settings.rs` | `app/src/surfaces/s13_space_settings.rs` |
| S14 library, documents | `kit/src/surfaces/s14_library.rs` | `app/src/surfaces/s14_library.rs` |
| S15 boards | `kit/src/surfaces/s15_boards.rs` | `app/src/surfaces/s15_boards.rs` |

The screens that exist today (`onboarding.rs`, `conversations.rs`, `composer.rs`, `mission.rs`, `spike/`) stay in the app crate as they were: they read `App`, so they move into the kit only once a surface ticket splits them into a view over plain data.
