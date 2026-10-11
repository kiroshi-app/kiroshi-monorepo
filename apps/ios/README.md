# Kiroshi iOS

The native iOS app. `project.yml` is the only source of truth: XcodeGen generates `Kiroshi.xcodeproj` from it, and the generated project is not committed.

**Never edit the `.xcodeproj`, edit `project.yml`.**

## Install

- Xcode 27, with the iOS 27 simulator runtime (`.xcode-version` pins the version)
- XcodeGen: `brew install xcodegen`

## Commands

Run from the repo root:

```bash
bun run ios:generate  # Generate apps/ios/Kiroshi.xcodeproj from project.yml
bun run ios:build     # Generate, then build for the iOS Simulator
bun run ios:test      # Generate, then run the tests on an iPhone 17 simulator (iOS 27.0)
bun run ios:run       # Generate, build, then launch the app on the booted iOS 27 iPhone, else an iPhone 17, and open DeviceHub (IOS_SIMULATOR="iPhone 18 Pro" picks another)
```

Format Swift with the toolchain's `swift format`, configured by the root `.swift-format`:

```bash
swift format lint --recursive apps/ios
```

## States without the network

A Debug build opens straight on one state of the Paper file "Kiroshi, iOS", fed by fixtures instead of the cloud and the relay, when launched with `-fixture` and the artboard number: page 1 "Sign in" (`1.1` to `1.10`, `1.7b`, plus `spaces` and `spaces-unreachable`) and page 2 "Space switcher" (`2.1`, `2.2` opens on the same screen as `2.1`: tap the title to open the menu, `2.3`):

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 1.7
```

Page 3 "Conversations" (`3.1` to `3.8`) is fed by a scripted host on the relay: it answers `conversation_bots`, `conversation_list`, `conversation_main_chat`, `conversation_message_page`, `conversation_send_turn` and `agent_cancel_turn`, and plays the host's events. Beside the six companions, `3.1` lists two group conversations: Release crew (Juniper and Atlas) and Design review (five companions, so the Hive shows two cells and `+3`). `conversations-live` opens on the same list, then plays a `conversation://created` (Launch plan), a `conversation://updated` renaming it Launch checklist, and a `conversation://deleted`, three seconds apart:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture conversations-live
```
 `3.2`, `3.5` and `3.8` open on Juniper's thread. Sending from any thread plays a whole turn (tools, a streamed reply, then the end of the turn). `3.6` goes online, loads the list, then hears the host leave two seconds later, as when the Mac app quits. `conversations-failed` and `thread-failed` open on the screens shown when the host refuses the list or the thread. `-draft` fills the composer of the thread a fixture opens:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.8 -draft $'Line one\nLine two'
```

`KiroshiUITests` runs the accessibility audit on 3.1, 3.2 and 3.8 as part of `bun run ios:test`.

The same fixtures feed the `#Preview`s.

Page 4 "Missions" opens on the Missions tab: `4.1` (the grouped list of Studio), `4.2` (the thread of OPE-212, with the composer), `4.3` (no missions) and `4.4` (Side project answers its list, then its host leaves). The scripted socket answers `mission_space_feed`, `conversation_bots`, `conversation_message_page`, `chat_store_attachments` and `conversation_send_turn`, so sending in `4.2` goes through the real store and relay connection.

## Settings and Sign out without the network

Page 5 "Settings" sits behind the gear of the Space screen. Two Debug fixtures keep the real Keychain and script the cloud (three spaces, Sign out answered), so signing out really empties the Keychain:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain-seeded  # Writes a fixture session to the Keychain, opens on the Space screen
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain         # Opens on whatever the Keychain holds
```

Tap the gear, then Sign out. Relaunched with `-fixture keychain` after confirming, the app opens on Sign in: no session is left on the device.

## The relay

`RelayConnection` is the one place the app talks to the relay member socket of the current Space (`docs/relay/member-socket.md`). Read its state and events with `updates()`, and send a call with `call(_:args:)`: the answer bearing the call's id comes back as a `RelayAnswer`. `SpaceStore.connection` is the connection of the Space shown.

## Missions

The Missions tab reads `mission_space_feed` for the shared Space and places each mission by its `state`: Needs you (`waiting_human`), Working (`working`, `waiting_bot`), Review (`ready_to_merge`). `failed`, `done` and `closed` have no group on page 4 and are not shown. A mission's thread is its thread conversation (`conversation_message_page`), read again when the companion speaks there, when the agent finishes a message or a turn there, and on every reconnection; an answer goes out with `conversation_send_turn`, files first through `chat_store_attachments`.

## Companion avatars

`CompanionAvatar` draws what the desktop draws: `CompanionAvatarEngine` runs `Kiroshi/Resources/companion-avatar.js` (built from `packages/ui` by `bun run avatar:build`, never edited by hand) in JavaScriptCore, caches the idle drawing per name, tint and theme, and computes a frame at 30 fps while the companion works, idle under Reduce Motion. A companion with a picture shows it once `relay_avatar` answers; until then, or when it fails, the drawn avatar stays. `CompanionAvatarTests` replays every case of `packages/ui/src/components/companion-avatar.fixture.jsonl` from the repo, so `bun run ios:test` fails when the bundle and the fixture part ways. In the Conversations fixtures, Shoto has a picture and Otto no tint.

A group conversation's icon is the desktop Hive: `CompanionAvatarEngine` calls `hiveLayout` from the same bundle for every cell's centre and side and the `+N` counter, and each cell is the companion's own avatar. `HiveLayoutTests` replays `packages/ui/src/components/hive-layout.fixture.jsonl` from the repo the same way.
