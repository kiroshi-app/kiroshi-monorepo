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
bun run ios:test      # Generate, then run every test (the Kiroshi plan) on an iPhone 17 simulator (iOS 27.0), UI tests on two clones of it
bun run ios:test:unit # Generate, then run the unit tests only (the KiroshiUnit plan), for iterating
bun run ios:run       # Generate, build, then launch the app on the booted iOS 27 iPhone, else an iPhone 17, and open DeviceHub (IOS_SIMULATOR="iPhone 18 Pro" picks another)
```

The two test plans are `Kiroshi.xctestplan` (every test, run once before a pull request) and `KiroshiUnit.xctestplan` (the unit tests, for iterating), both referenced from `project.yml`. A UI test covers only the accessibility of a new screen state; behaviour goes to unit tests. `bun run ios:test` runs the UI test classes in parallel on two clones of the simulator (CI runs them one after the other, clones never start a UI test on its hosted runner), so a UI test never depends on another one or on their order. `KiroshiUITests` launches a Debug build with `-disablesAnimations YES`, which turns UIKit animations off: XCUITest waits for the app's UIKit animations to end before each action, and once the keyboard is up it sometimes waits the full 60 seconds, action after action.

Every generate writes the build number to `BuildNumber.xcconfig` (not committed): Xcode Cloud's `CI_BUILD_NUMBER` when set, else `git rev-list --count HEAD`. The version stays `MARKETING_VERSION` in `project.yml`.

Format Swift with the toolchain's `swift format`, configured by the root `.swift-format`:

```bash
swift format lint --recursive apps/ios
```

## Xcode Cloud to TestFlight

Every merge on `main` that touches `apps/ios` or `.xcode-version` is archived by Xcode Cloud and lands in TestFlight for the internal group. Nobody opens Xcode for it.

The repo holds one piece: `ci_scripts/ci_post_clone.sh`, next to where `Kiroshi.xcodeproj` is generated, as Xcode Cloud expects. After the clone it downloads XcodeGen 2.46.0 from its GitHub release (sha256 checked, the version `brew install xcodegen` gives locally), then runs `xcodegen generate --spec project.yml` from `apps/ios`, like `bun run ios:generate`. The build number is `CI_BUILD_NUMBER`. Xcode Cloud clones shallow, so the script stops when that variable is missing instead of counting commits. It prints `xcodebuild -version` and warns, without failing, when it differs from `.xcode-version`. Xcode Cloud picks Xcode in the workflow, not from that file: when `.xcode-version` moves, move the workflow's Environment with it.

Everything else lives in App Store Connect. Apple asks for the first workflow to be created in Xcode.

Once, in App Store Connect and GitHub:

1. The app record for `com.kiroshi.app.ios` (team `BBE5V2JL5H`, iOS). Xcode offers to create it during step 4 below if it's missing.
2. In TestFlight, an internal group (Internal Testing, +), with every tester in it.
3. Xcode Cloud's access to `shoto290/kiroshi-monorepo`, granted with a GitHub admin of the repo when Xcode asks.

The workflow, from Xcode:

4. `bun run ios:generate`, open `apps/ios/Kiroshi.xcodeproj`, Report navigator, Cloud, Get Started. Product: Kiroshi. Then Edit Workflow.
5. General: name it `TestFlight from main`. The project is `apps/ios/Kiroshi.xcodeproj`, the scheme `Kiroshi`.
6. Environment: Xcode `27.0`, the version in `.xcode-version`, not Latest Release. macOS: the one Xcode Cloud recommends for it. Clean: off (only external testing needs it).
7. Start Conditions: delete the suggested Pull Request Changes. Branch Changes: Source Branch, Custom Branches, `main`. Files and Folders, Custom Conditions: Start a Build, Any File, in the folder `apps/ios`, then Start a Build, Filename `.xcode-version`, in any folder. Auto-cancel Builds: off, so each merge gets its own build.
8. Actions: one Archive, platform iOS, scheme `Kiroshi`, Deployment Preparation TestFlight (Internal Testing Only).
9. Post-Actions: TestFlight Internal Testing, with the internal group from step 2. No TestFlight External Testing.
10. Save, grant access to the repository, then Start Build on `main`.

Xcode Cloud numbers builds from 1. If TestFlight already holds a `0.1.0` build uploaded by hand, set App Store Connect, Xcode Cloud, Settings, Build Number, Next Build Number above it.

## States without the network

A Debug build opens straight on one state, fed by fixtures instead of the cloud and the relay, when launched with `-fixture` and the artboard number. Page 1 "Sign in" of the Paper file "Kiroshi, iOS 2" (`1.1` to `1.10`, `1.7b`, plus `spaces` and `spaces-unreachable`; set the simulator to dark with `xcrun simctl ui booted appearance dark` for the `· dark` artboards):

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 1.7
```

Page 2 "Accueil" of the Paper file "Kiroshi, iOS 2" is fed by a scripted host on the relay, with the artboards' Studio: Juniper, Atlas, Pico, Mira and Otto with their roles, and the group conversation Release 0.42 (Juniper, Pico and Mira). `2.1` opens on the list, `2.2` on the same screen (tap the Space button, next to your initial, to open the menu of Spaces), `2.3` on a Space without companions, `2.4` on the list still loading, `2.5` on Side project, whose host leaves two seconds after the list loads, and `2.6` on the list while Juniper works:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 2.6
```

Both lists, Conversations and Missions, share one header: your initial (it opens Settings) then the Space button (it opens the menu of Spaces), both system glass buttons at the top left, the list blurring under them through the system scroll edge effect, and the + of New Conversation top right on Conversations.

The Conversations list plays through a scripted host: it answers `conversation_bots`, `conversation_list`, `conversation_main_chat`, `conversation_message_page`, `conversation_send_turn`, `chat_store_attachments`, `agent_cancel_turn` and `conversation_create`, and plays the host's events. The + at the top right of the Conversations tab opens New Conversation, the companions of the Space to pick from: Create sends `conversation_create` and opens the new group conversation, which the scripted host then lists and announces with `conversation://created`. `conversations` lists the six companions beside two group conversations: Release crew (Juniper and Atlas) and Design review (five companions, so the Hive shows two cells and `+3`). `conversations-live` opens on the same list, then plays a `conversation://created` (Launch plan) three seconds later, and, once Launch plan's thread is open, a `conversation://updated` renaming it Launch checklist and a `conversation://deleted`, three seconds apart:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture conversations-live
```

Page 3 "Fil" of "Kiroshi, iOS 2" opens on Juniper's thread: `3.1` (the conversation: one bubble per paragraph, the avatar under the last bubble of a run, a `Today` separator), `3.2` (empty), `3.3` (Juniper at work, the clock counting), `3.4` (Side project, whose host leaves two seconds after the thread loads) and `3.5` (the times shown, as a swipe left shows them). Each message's time is drawn only while a swipe left slides the thread; launched with `-holdsTimes YES`, the thread stays slid after the finger lifts, which is how `KiroshiUITests` checks the gesture. The times follow the simulator's locale: `-AppleLocale en_US` gives the artboards' `9:38 AM`. Sending from any thread plays a whole turn (tools, a streamed reply, then the end of the turn). `slow-thread` opens on Juniper's thread of 31 messages, more than a screen, that the host answers two seconds late, as a slow relay does: the thread shows its loading, then opens on its last message. `conversations-failed` and `thread-failed` open on the screens shown when the host refuses the list or the thread. `-draft` fills the composer of the thread a fixture opens:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.5 -AppleLocale en_US
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.1 -draft $'Line one\nLine two'
```

The group thread plays Release crew (Juniper leads, Atlas): `group-thread` opens on it, each companion's messages under its name and avatar, `group-mention` opens it with `@` typed so the mention picker shows, `group-working` with Juniper and Atlas both at work, and `group-failed` on the thread refused. Picking a companion in the picker writes `@Name`, sent to the host as `<@botId>` with that companion in `summoned`; with no mention, `summoned` stays empty and the host summons the lead, as the desktop does. The scripted host answers a group send with an `On it.` from each companion summoned:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture group-mention
```

A solo Conversation, a group Conversation and a Mission open the same thread screen (`Thread/ThreadScreen.swift`), built from the same header, message rows and composer; `ThreadStore` and `MissionThreadStore` stay apart behind `ThreadModel`. The header is variant A of the page "Header, explorations": the companion's avatar over a glass capsule, its name then its title (the `title` of `conversation_bots`) in a Conversation, the group's Hive over its name in a group, `ticket · companion · title` over the mission in a Mission, the thread blurring under it through the system scroll edge effect. A companion without a title shows its name alone. Each line stays on one line, truncated, and the header stays centred in the bar whatever its length: `long-name` opens Juniper renamed Juniper Wilhelmina Fitzgerald-Montgomery, `long-group` a group with a long name. The composer is the same in all three, under the same scroll edge effect as the header: + (Photo Library, Choose File), the field, then Send, or Stop while a companion works in a Conversation. Files go to the host through `chat_store_attachments` before the message names them, in a Conversation as in a Mission. `-history YES` gives `3.1` and `5.2` the earlier messages the `scrolled` artboards draw, so the thread runs under the header:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.1 -history YES
```

`KiroshiUITests` runs the accessibility audit on every state of page 1 (`1.1` to `1.10`, `1.7b`), on 2.1, 2.3, 2.4, 2.5, 2.6, `conversations`, and every state of page 3 (`3.1` to `3.5`), swipes left on `3.1` to bring the times in, scrolls `3.1` up at the largest text size, opens `slow-thread` twice and checks each open shows the loading then lands on the last message with no scroll, opens the menu of Spaces on 2.1, checks both tabs of 2.1 show the same header (your initial and the Space button, at the same place) and opens the menu of Spaces from Missions, and from 2.1 creates a group conversation with the + and runs the audit on New Conversation, as part of `bun run ios:test`.

The same fixtures feed the `#Preview`s.

Page 5 "Missions" of "Kiroshi, iOS 2" opens on the Missions tab: `5.1` (the grouped list of Studio), `5.2` (the thread of OPE-212, in the bubbles of page 3, with the composer), `5.3` (no missions) and `5.4` (Side project answers its list, then its host leaves). `slow-mission` opens on the thread of OPE-212 that the host answers two seconds late, as a slow relay does: the thread shows its loading, then the mission. The scripted socket answers `mission_space_feed`, `conversation_bots`, `conversation_message_page`, `chat_store_attachments` and `conversation_send_turn`, so sending in `5.2` goes through the real store and relay connection. A swipe left in the thread shows each message's time, and `-holdsTimes YES` keeps it slid as on page 3:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 5.2 -AppleLocale en_US -holdsTimes YES
```

`KiroshiUITests` runs the accessibility audit on `5.1`, `5.3` and `5.4`, opens OPE-212 from `5.1` and audits it as `5.2` draws it, then swipes left to bring the times in. `MissionOpeningTests` opens `slow-mission`, goes back, opens OPE-212 again and checks it shows the loading, then the thread. `ThreadHeaderTests` opens Juniper, Shoto, Release crew and OPE-212 from their lists and reads each header: `Juniper, Writer`, `Shoto`, `Release crew`, `OPE-212 · Atlas · Planner, Split the onboarding flow`; checks `3.1`, `group-thread` and `5.2` show the same header and composer; and checks `long-name` and `long-group` keep their name on one line, centred.

## Settings and Sign out without the network

Page 6 "Réglages" of "Kiroshi, iOS 2" is the sheet your initial, top left of the Conversations and Missions tabs, presents. `6.1` opens on the Settings sheet, `6.2` on its Sign out confirmation; both sign in Sam with three spaces (Studio, Home lab, Side project) kept in memory and answer Sign out, so confirming lands on the Opening screen:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 6.2
```

`KiroshiUITests` opens the sheet from both tabs of `2.1`, checks `6.1` opens it once, on Conversations only, cancels then confirms Sign out from `6.2`, and runs the accessibility audit on `6.1` and `6.2`.

Two more Debug fixtures keep the real Keychain and script the cloud (three spaces, Sign out answered), so signing out really empties the Keychain:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain-seeded  # Writes a fixture session to the Keychain, opens on the Space screen
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain         # Opens on whatever the Keychain holds
```

Tap your initial, then Sign out. Relaunched with `-fixture keychain` after confirming, the app opens on Sign in: no session is left on the device.

## The relay

`RelayConnection` is the one place the app talks to the relay member socket of the current Space (`docs/relay/member-socket.md`). Read its state and events with `updates()`, and send a call with `call(_:args:)`: the answer bearing the call's id comes back as a `RelayAnswer`. `SpaceStore.connection` is the connection of the Space shown.

## Missions

The Missions tab reads `mission_space_feed` for the shared Space and places each mission by its `state`: Needs you (`waiting_human`), Working (`working`, `waiting_bot`), Review (`ready_to_merge`). `failed`, `done` and `closed` have no group on page 5 and are not shown. A mission's thread is its thread conversation (`conversation_message_page`), drawn with the Conversation thread's bubbles under a `Mission opened by` line at the mission's `openedAt`, read again when the companion speaks there, when the agent finishes a message or a turn there, and on every reconnection; an answer goes out with `conversation_send_turn`, files first through `chat_store_attachments`.

## Companion avatars

`CompanionAvatar` draws what the desktop draws: `CompanionAvatarEngine` runs `Kiroshi/Resources/companion-avatar.js` (built from `packages/ui` by `bun run avatar:build`, never edited by hand) in JavaScriptCore, caches the idle drawing per name, tint and theme, and computes a frame at 30 fps while the companion works, idle under Reduce Motion. A companion with a picture shows it once `relay_avatar` answers; until then, or when it fails, the drawn avatar stays. `CompanionAvatarTests` replays every case of `packages/ui/src/components/companion-avatar.fixture.jsonl` from the repo, so `bun run ios:test` fails when the bundle and the fixture part ways. In the Conversations fixtures, Shoto has a picture and Otto no tint.

A group conversation's icon is the desktop Hive: `CompanionAvatarEngine` calls `hiveLayout` from the same bundle for every cell's centre and side and the `+N` counter, and each cell is the companion's own avatar. `HiveLayoutTests` replays `packages/ui/src/components/hive-layout.fixture.jsonl` from the repo the same way.
