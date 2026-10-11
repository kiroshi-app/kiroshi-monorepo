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

Every generate writes the build number to `BuildNumber.xcconfig` (not committed): Xcode Cloud's `CI_BUILD_NUMBER` when set, else `git rev-list --count HEAD`. The version stays `MARKETING_VERSION` in `project.yml`.

Format Swift with the toolchain's `swift format`, configured by the root `.swift-format`:

```bash
swift format lint --recursive apps/ios
```

## States without the network

A Debug build opens straight on one state, fed by fixtures instead of the cloud and the relay, when launched with `-fixture` and the artboard number. Page 1 "Sign in" of the Paper file "Kiroshi, iOS 2" (`1.1` to `1.10`, `1.7b`, plus `spaces` and `spaces-unreachable`; set the simulator to dark with `xcrun simctl ui booted appearance dark` for the `· dark` artboards):

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 1.7
```

Page 2 "Accueil" of the Paper file "Kiroshi, iOS 2" is fed by a scripted host on the relay, with the artboards' Studio: Juniper, Atlas, Pico, Mira and Otto with their roles, and the group conversation Release 0.42 (Juniper, Pico and Mira). `2.1` opens on the list, `2.2` on the same screen (tap the Space name in the navigation bar to open the menu of Spaces), `2.3` on a Space without companions, `2.4` on the list still loading, `2.5` on Side project, whose host leaves two seconds after the list loads, and `2.6` on the list while Juniper works:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 2.6
```

The thread fixtures come from page 3 "Conversations" of the older file and play through the same scripted host: it answers `conversation_bots`, `conversation_list`, `conversation_main_chat`, `conversation_message_page`, `conversation_send_turn`, `agent_cancel_turn` and `conversation_create`, and plays the host's events. The + at the top right of the Conversations tab opens New Conversation, the companions of the Space to pick from: Create sends `conversation_create` and opens the new group conversation, which the scripted host then lists and announces with `conversation://created`. `3.1` lists the six companions beside two group conversations: Release crew (Juniper and Atlas) and Design review (five companions, so the Hive shows two cells and `+3`). `conversations-live` opens on the same list, then plays a `conversation://created` (Launch plan) three seconds later, and, once Launch plan's thread is open, a `conversation://updated` renaming it Launch checklist and a `conversation://deleted`, three seconds apart:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture conversations-live
```
 `3.2`, `3.5` and `3.8` open on Juniper's thread. Sending from any thread plays a whole turn (tools, a streamed reply, then the end of the turn). `conversations-failed` and `thread-failed` open on the screens shown when the host refuses the list or the thread. `-draft` fills the composer of the thread a fixture opens:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.8 -draft $'Line one\nLine two'
```

`KiroshiUITests` runs the accessibility audit on every state of page 1 (`1.1` to `1.10`, `1.7b`), on 2.1, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2 and 3.8, opens the menu of Spaces on 2.2, and from 2.1 creates a group conversation with the + and runs the audit on New Conversation, as part of `bun run ios:test`.

The same fixtures feed the `#Preview`s.

Page 4 "Missions" opens on the Missions tab: `4.1` (the grouped list of Studio), `4.2` (the thread of OPE-212, with the composer), `4.3` (no missions) and `4.4` (Side project answers its list, then its host leaves). The scripted socket answers `mission_space_feed`, `conversation_bots`, `conversation_message_page`, `chat_store_attachments` and `conversation_send_turn`, so sending in `4.2` goes through the real store and relay connection.

## Settings and Sign out without the network

Page 6 "Réglages" of "Kiroshi, iOS 2" is the sheet your initial, top left of the Conversations tab, and the gear of the Missions tab present. `6.1` opens on the Settings sheet, `6.2` on its Sign out confirmation; both sign in Sam with three spaces (Studio, Home lab, Side project) kept in memory and answer Sign out, so confirming lands on the Opening screen:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 6.2
```

`KiroshiUITests` opens the sheet from `2.1` and `4.1`, checks `6.1` opens it once, on Conversations only, cancels and confirms Sign out from `6.1`, and runs the accessibility audit on `6.1` and `6.2`.

Two more Debug fixtures keep the real Keychain and script the cloud (three spaces, Sign out answered), so signing out really empties the Keychain:

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
