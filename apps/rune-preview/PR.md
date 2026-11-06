## Launch

With the installed Kiroshi open, from the repo root:

```
cargo run --release --manifest-path apps/rune-preview/Cargo.toml
```

The onboarding comes first. Its last step opens the conversation tab, which reads the installed Kiroshi: your Spaces, agents and conversations. A message sent from the preview reaches your real agents.

## Host transport

HTTP `POST /api/invoke/{command}` and the `/api/events` WebSocket of the Kiroshi host, with a bearer token. No change to apps/app, packages/ui or the host.

- Conversation tab: the host of the bundled `Kiroshi.app/Contents/MacOS/Kiroshi`, found among the listening processes, with the token of `com.kiroshi.app/host/token`. That is the only file of `com.kiroshi.app` the preview opens. A local image path under a Kiroshi data folder is refused and shown as a placeholder.
- Onboarding: reads the Kiroshi Dev profile when it runs (`agent_account`, `claude_import_inventory`, `account_state`). Without it, onboarding shows the provider choice, skips the import and shows the signed-out account step.
- `--smoke-send <text>`: Kiroshi Dev only. `--smoke-read [conversation id]`: read-only check on the installed host (Spaces, agents, conversations, one thread).

## Crates added beyond Rune

- `ureq` 2: host calls and image fetches.
- `tungstenite` 0.29: the host event socket.
- `serde`, `serde_json`: payloads.
- `uuid` 1: message and turn ids.
- `rune-motion` (part of Rune, same rev): the spinner's rotation.

Geist and Geist Mono (OFL, vercel/geist-font v1.9.1) are embedded from `assets/fonts`, since the fontsource package only ships woff2.

## What Rune doesn't draw, and its placeholder

- Dithered hexagonal avatars: the same rounded hexagon from `kiroshi-hexagon`, in the agent's ground and ink colours, flat.
- KaTeX: a grey box with the TeX source in mono.
- Tabs: one plain pill with the open conversation's name, where the tab strip sits.
- Space avatar state badge: not drawn.
- Conversation subject icons: always the message glyph, in the conversation's hue.

## Decisions taken alone

- Components are built from Rune primitives where rune-kit's look differs from main (pill buttons, checkbox, radio, fields, roster rows, bubbles, prompt). rune-kit gives Markdown, syntax colouring, mermaid, the text inputs with mention pills and the mention popup.
- Measurements come from the packages/ui stories rendered in Chromium (layout, paddings, radii, colours, type), compared side by side with Rune headless scenes at 1180x780.
- Space and agent colours use a port of `hue-recipe` `toneOf`; its test pins four preset tones to the CSS tokens.
- The roster is `conversation_page` (pinned first, then by activity), as main. A row opens its conversation. `conversation_main_chat` is no longer called.
- Roster dates older than four weeks are formatted in UTC.
- Threads of 40 messages or fewer anchor at the bottom without virtualisation. Longer ones are virtualised.
- The import step advances without importing. The sign-in steps show their screens without completing.
- The prompt is one line high.
- The mention menu has no "Agents" heading.
