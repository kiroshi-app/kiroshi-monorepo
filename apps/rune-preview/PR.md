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

`python3 apps/rune-preview/bench/measure.py` writes `bench/results.json`: every run, its machine load (`os.getloadavg()` before and after) and the tool. Each measure runs three times, the table gives the median. Last run: Mac18,5, 12 cores, 24 GiB, macOS 27.0.1, screen unlocked, 1-minute load 3.3 to 4.3.

| Measure | Tool, the same on both sides | Kiroshi | Preview |
|---|---|---|---|
| Cold start, first frame | `open -n` on a bundle, then the pid's first window in `CGWindowListCopyWindowInfo` | 521 ms (Kiroshi Dev) | 254 ms (`--dev-host`) |
| Cold start, conversation displayed | `screencapture -l` of that window, read by Vision until the last word of the last message shows | 2,067 ms (Kiroshi Dev, ±218 ms) | 583 ms (`--dev-host`, ±171 ms) |
| Memory | `footprint`, Kiroshi plus its WebKit helpers against the preview, agents excluded | Not measured | Not measured |
| CPU at rest | `ps` CPU time of both process sets over the same 60 s | Not measured | Not measured |
| Scroll frame times | none | Not measured | Not measured |
| Key press to glyph | none | Not measured, by decision | Not measured, by decision |

**Cold start.** Kiroshi Dev's release bundle against the preview, on "Bench: long conversation" (2,778 messages, written by `bench/fabricate.py` into Kiroshi Dev only). Kiroshi Dev starts its own host and opens the conversation from a tab the bench restores. The preview starts against Kiroshi Dev's host, already running, and finds the longest conversation itself. The installed Kiroshi is never quit. The ± is the median gap between two captures, so the true moment lies up to that much before the number.

**Why the rest isn't measured.**
- No installed Kiroshi window shows its longest conversation (2,778 messages): the two windows show other conversations. The bench sends Kiroshi no input, so it can't open that conversation.
- Scroll: no synthetic scroll ever reaches the installed Kiroshi, so the same scroll can't run on both sides. Accessibility isn't granted to the shell either.

To fill memory and CPU at rest: open the longest conversation in a Kiroshi window by hand, keep the screen unlocked, and run `measure.py` again. It checks every Kiroshi window by itself.

**Tauri cost centres.** From an xctrace Time Profiler recording (`--all-processes`, 20 s) of Kiroshi Dev opening the bench conversation: 3.9 s of CPU across Kiroshi Dev and its WebKit helpers, self time by process and leaf binary.
1. WebContent, JavaScriptCore: 1,836 ms, 47 %. Regular expression compilation first (`Yarr::CharacterClassConstructor`), then garbage collection (`JSFinalObject::visitChildren`).
2. WebContent, WebCore: 287 ms, 7 %. Style resolution (`TreeResolver::resolveComposedTree`) and painting (`RenderLayer::paintLayerContents`).
3. Kiroshi, the kernel: 262 ms, 7 %. Mach messages, then `open`.

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
