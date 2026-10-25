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
bun run ios:test      # Generate, then run every test (the Kiroshi plan) on the simulator IOS_SIMULATOR names ("iPhone 17" when unset), one test class after the other
bun run ios:test:unit # Generate, then run the unit tests only (the KiroshiUnit plan) on the same simulator
bun run ios:run       # Generate, build, then launch the app on the same simulator and open DeviceHub
```

The two test plans are `Kiroshi.xctestplan` (every test, run once before a pull request) and `KiroshiUnit.xctestplan` (the unit tests, for iterating), both referenced from `project.yml`. A UI test covers only the accessibility of a new screen state; behaviour goes to unit tests. `bun run ios:test` runs the UI test classes one after the other on the ticket's simulator, as CI does (`-parallel-testing-enabled NO`): parallel testing would shut that simulator down and boot two clones of it at every run, and clones never start a UI test on CI's hosted runner. A UI test still never depends on another one or on their order. `KiroshiUITests` launches a Debug build with `-disablesAnimations YES`, which turns UIKit animations off: XCUITest waits for the app's UIKit animations to end before each action, and once the keyboard is up it sometimes waits the full 60 seconds, action after action.

Every generate writes the build number to `BuildNumber.xcconfig` (not committed): Xcode Cloud's `CI_BUILD_NUMBER` when set, else `git rev-list --count HEAD`. The version stays `MARKETING_VERSION` in `project.yml`.

Format Swift with the toolchain's `swift format`, configured by the root `.swift-format`:

```bash
swift format lint --recursive apps/ios
```

## What every worktree shares

On a Mac, CI unset, every xcodebuild of `ios:build`, `ios:test`, `ios:test:unit`, `ios:run` and `bun run ci ios` goes through `apps/ios/scripts/xcodebuild.sh`, which shares two things between worktrees, both in `~/Library/Caches/kiroshi-ios`. CI and Xcode Cloud run plain `xcodebuild`.

- `SourcePackages`: the Swift packages (GoogleSignIn, AppAuth, GTMAppAuth, GTMSessionFetcher, Highlightr), checked out once (`-clonedSourcePackagesDirPath`). A new worktree neither fetches them nor checks them out again.
- `CompilationCache.noindex`: Xcode's compilation cache (`COMPILATION_CACHE_ENABLE_CACHING`), one CAS for every worktree. A new worktree replays from it every compile job another worktree already ran, the SDK's Clang modules and every package, and compiles only our own targets (Kiroshi, KiroshiTests, KiroshiUITests). The keys hold no worktree path: the SDK and Xcode are prefix-mapped (`SWIFT_ENABLE_PREFIX_MAPPING`, `CLANG_ENABLE_PREFIX_MAPPING`), and so are the worktree's `apps/ios/build` and `apps/ios/Kiroshi.xcodeproj`, the packages' working directory (`*_OTHER_PREFIX_MAPPINGS`), by their physical path and, under `/private`, by the path without it, the one Xcode passes. Our sources aren't mapped (`SWIFT_ENABLE_PROJECT_PREFIX_MAPPING` stays off): their keys hold the worktree's path, so `#filePath`, from which `CompanionAvatarTests` reads its fixtures, always names this worktree's files.

Builds running at once share both. DerivedData stays in each worktree, `apps/ios/build`, and with it `Build/Products`: one DerivedData shared by two worktrees refuses the second build while the first runs (`database is locked`), and would let one worktree test the other's products.

On a machine that opted in to the heavy job slots (`~/.kiroshi/slots`), `xcodebuild.sh` runs xcodebuild through `scripts/slot.sh`: when every slot is taken the build prints `slot.sh: xcodebuild ... waiting for one of N slots for Ns` every 30 seconds and starts as soon as one frees, it never fails for lack of a slot. Inside `bun run ci ios`, already in a slot, it takes no second one.

Wipe the shared caches while no iOS build runs, from any worktree:

```bash
rm -rf ~/Library/Caches/kiroshi-ios
```

## Testing while you work

One simulator per ticket, kept for the whole mission. `apps/ios/scripts/simulator.ts` prints the UDID of the simulator `IOS_SIMULATOR` names: it creates it the first time (the device type is the end of the name, `iPhone 17` here), boots it when it's shut down, and never deletes it. `ios:test`, `ios:test:unit` and `ios:run` go through it, so every run of the mission reuses the same booted simulator:

```bash
export IOS_SIMULATOR="OPE-NN iPhone 17"
export SIMULATOR=$(bun apps/ios/scripts/simulator.ts)
```

With several simulators booted, `booted` in the commands of this file picks any of them: give `$SIMULATOR` instead, e.g. `xcrun simctl io "$SIMULATOR" screenshot shot.png`.

Build the tests once after each change, then run only the classes your diff touches, as often as you need, without building again. `-parallel-testing-enabled NO` runs them on this simulator: without it, the Kiroshi plan's UI tests run on a clone, which shuts this simulator down and boots the clone at every run:

```bash
bun run ios:generate
apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi -destination "platform=iOS Simulator,id=$SIMULATOR" -derivedDataPath apps/ios/build build-for-testing
apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi -destination "platform=iOS Simulator,id=$SIMULATOR" -derivedDataPath apps/ios/build -parallel-testing-enabled NO -collect-test-diagnostics never test-without-building -only-testing:KiroshiTests/CompanionAvatarTests -only-testing:KiroshiUITests/ThreadHeaderTests
```

The whole plan runs once, before the push, on the same simulator: `bun run ios:test`, which reads `IOS_SIMULATOR` and runs every test on that simulator, or `bun run ci ios`, which reads `SIMULATOR` and boots it only when it isn't booted yet.

At the end of the mission, shut down and delete that simulator only, never `xcrun simctl shutdown all`, which stops every other agent's:

```bash
xcrun simctl shutdown "$SIMULATOR"
xcrun simctl delete "$SIMULATOR"
```

## Device keys and protocol v2

The iPhone speaks protocol v2 of `docs/relay/v2-protocol.md`: every call leaves sealed and signed with its own device keys, and every answer or event is opened only once the host's signature verifies. The relay carries bytes it can neither read nor forge.

- `DeviceKeyStore` creates an Ed25519 signing key and an X25519 agreement key once, in the session's Keychain service, as one 64-byte item (`device-keys`, the signing key then the agreement key, added once, never overwritten, after first unlock, this device only, never synchronised): two first reads at once end with the same identity. Sign out clears the session only; the keys stay. A Keychain failure other than "no item" leaves the identity unavailable, never replaced.
- Every sign-in, and every launch of a signed-in app, proves the device key (`docs/relay-v2.md` of kiroshi-cloud): `POST /devices/challenge`, then `POST /devices` with both public keys, the nonce and the Ed25519 signature over `kiroshi-device-register-v1` ‖ user id ‖ signing key ‖ nonce (`DeviceProof`), the user id read from `GET /me` for a session saved without it. A key another account held moves to the account signing in (`transferred`). A nonce refused as expired or used is retried once with a fresh challenge. The answered id is kept per account (`relay-device.<account>`) and opens every socket with `?device=`; a restored session registers again once per launch, so an iPhone signed in before device approval existed is known to the relay's device states, and Check again reuses the id. Any refusal other than 401 keeps the person signed in on `Couldn’t add this iPhone to your account` with Check again (`device-not-added`); unreadable keys land on `Couldn’t read this iPhone’s keys`.
- Sign out sends `DELETE /devices/<id>` then revokes the bearer, best-effort in `SignInModel.revocation`, which the sign-out never awaits; the next registration waits for it. The keys stay. A relay socket closed with 4006 ends the session without reconnecting and opens Sign in with `This iPhone now belongs to another Kiroshi account, so you’ve been signed out.` (`device-moved`).
- `RelayCrypto` is the codec, checked against a byte for byte copy of `v2-crypto.json` in `KiroshiTests/Vectors` (`RelayCryptoVectorTests`), beside a Swift-made signature vector. `bip39-english.txt` ships in the app for the fingerprint, its SHA-256 checked when read.
- `RelayConnection` persists its last sent `ctr` per Space and `key_id` before a frame leaves, and the last accepted per sender (`FrameCounters`, in the Keychain): it never sends again under a `key_id` whose counter can't be read back. A member frame carries no `from`; the relay adds it.
- Every socket opens with a sealed `{"hello":{}}` without challenge. A call leaves only once the host's hello to this iPhone has given the 32-byte challenge, which it then carries; one still waiting fails on the call timeout. The challenge lives as long as the socket. The host never names a frame it refused, it answers a hello: one with another challenge replaces it, and each call sent under an older one goes again once, under a new `ctr`; refused again, it fails with `challengeRefused`. `HostSealingTransport` answers the hello and drops a frame without its challenge, as the host does; `RelayChallengeTests` plays the host's rules on the keys of `v2-crypto.json`.
- A Space whose key this iPhone doesn't hold is joined by its first verified rekey (`docs/relay/v2-protocol.md`, Joining by the first rekey): `RelayConnection` opens the member socket, sends a hello under `key_id` 0 sealed with a key it throws away, again on every ping, and takes the first `rekey` frame addressed to this device whose box opens under its agreement key, whose roster set verifies under its own host row and lists this device, and whose signature verifies under that host key (`SpaceHandover`). `KeychainSpaceKeyStore` then stores the Space key sealed to this device's agreement key, the host key, its relay id and the signed roster, after first unlock, this device only, and the same socket says its hello under the key. Until then both tabs show `Waiting for the key to Studio` (`join-space`), never unreachable.

In Debug, `RelayEnvironment(transport:clock:)` plays the host's side of v2 around any scripted socket (`HostSealingTransport` in `Fixtures/FixtureKeys.swift`): the scripted host keeps reading and writing plaintext, and the app goes through the real sealing, signatures and counters.

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture join-space
```

## Device approval

A new iPhone of an account (`POST /devices` answers `pending`) reads no Space until another device of the account approves it, or the emailed code does. Page "Mockup" of the Paper file "Kiroshi, E2E Spaces v2", row 6 (iPhone side), draws each state; `DeviceApproval` (`SignIn/`) holds them:

- Waiting (6): this iPhone's name and six-word fingerprint, `Waiting for approval…`. It reads `GET /devices/current` every five seconds, never `POST /devices`, which would push the deadline back.
- Approved (6.2): `This device is approved` while the spaces load, without registering again.
- Not me (6.3): another device refused this one, which deleted its session (`GET /devices/current` answers 401). The Keychain session goes at once; `Back to sign in` opens Welcome.
- Request expired (6.4): `Ask again` registers once more, which gives a new 30 minutes.
- No other device (6.5): `POST /devices/approval-code` emails a 6-digit code, valid 5 minutes, one use; `POST /devices/approval-code/verify` approves. Three wrong codes ask for a new one.

An approved iPhone reads `GET /devices` every 15 seconds while it's in the foreground (`DeviceRequests`, `Shell/`): another device of the account still pending opens the sheet row 10 draws, its fingerprint computed from the listed `ed25519PublicKey`, with Approve (`POST /devices/<id>/approve`) and Not me (`POST /devices/<id>/reject`). Settings shows this iPhone's own fingerprint. Both reads sit behind `DeviceStates` (`Core/DeviceStates.swift`, the shapes of OPE-1046), which the fixtures replace with `FixtureDeviceStates`:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture approval-6     # also approval-6.2, approval-6.3, approval-6.4, approval-6.5
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture device-request  # Sam's MacBook Pro asks, over 2.1
```

`DeviceApprovalAccessibilityTests` audits each state, the waiting screen and the sheet at the largest text size, goes back to sign in from 6.3 and approves from the sheet.

## Invitations

Row 4 of page "Mockup" of the Paper file "Kiroshi, E2E Spaces v2" draws them. `Invitations` (`Invitations/`) reads `GET /invitations` when the app comes to the foreground: a badge on the Space button counts them, and the menu of Spaces lists each under Invitations (the Space, `Invited by` its inviter). A row opens the sheet, which reads `GET /invitations/{id}/state` for the expiry. Accept calls `POST /invitations/{invitationId}/accept`, then, on a `200` or a `409 ALREADY_JOINED`, joins by the first rekey on a member socket of its own (`Joining…`) and lands on the Space once it answers; a host offline keeps the sheet waiting (`Host · Offline`), Decline then leaves the Space (`DELETE /instances/{id}/membership`). Before an accept, Decline calls `POST /invitations/{invitationId}/decline`. A withdrawn, expired or used invitation, or one sent to another email, says so with the gesture to fix it.

The email's Join button, `https://kiroshi.app/join?invitation=<id>`, is a universal link (`applinks:kiroshi.app`, the AASA served by `apps/website`): it opens the sheet on that invitation, read from the list, or from its state when the list doesn't hold it (another email). A link opened before sign-in waits for it.

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 4.2   # also 4, 4.1, 4.3 to 4.7, invitation-expired, invitation-other-email, invitation-already-joined, invitation-not-found
xcrun simctl openurl booted "https://kiroshi.app/join?invitation=4c1d0000-0000-4000-8000-000000000001"  # over -fixture 4
```

`4` and `4.1` open Home on Personal with an invitation to Studio from noa@example.com (tap the Space button for `4.1`), `4.2` opens the sheet through the link, `4.3` holds the accept, `4.4` accepts while Studio's host is offline, `4.5` gets no answer, `4.6` and `invitation-expired` read a withdrawn and an expired state, `invitation-other-email` opens a link the account isn't invited by, `4.7` accepts, receives the scripted host's rekey (`FixtureRekey`) and lands on Studio, `invitation-already-joined` gets `409 ALREADY_JOINED` and joins Studio the same way, and `invitation-not-found` gets a bare `404` and says the invitation doesn't exist anymore. `InvitationAccessibilityTests` audits the badge, the menu and each state of the sheet, the sheet at the largest text size, and lands on Studio from `4.7` and `invitation-already-joined`.

## Xcode Cloud to TestFlight

Every merge on `main` that touches `apps/ios` or `.xcode-version` is archived by Xcode Cloud and lands in TestFlight for the internal group. Nobody opens Xcode for it.

The repo holds one piece: `ci_scripts/ci_post_clone.sh`, next to where `Kiroshi.xcodeproj` is generated, as Xcode Cloud expects. After the clone it downloads XcodeGen 2.46.0 from its GitHub release (sha256 checked, the version `brew install xcodegen` gives locally), then runs `xcodegen generate --spec project.yml` from `apps/ios`, like `bun run ios:generate`. The build number is `CI_BUILD_NUMBER`. Xcode Cloud clones shallow, so the script stops when that variable is missing instead of counting commits. It prints `xcodebuild -version` and warns, without failing, when it differs from `.xcode-version`. Xcode Cloud picks Xcode in the workflow, not from that file: when `.xcode-version` moves, move the workflow's Environment with it.

Everything else lives in App Store Connect. Apple asks for the first workflow to be created in Xcode.

Once, in App Store Connect and GitHub:

1. The app record for `com.kiroshi.app.ios` (team `BBE5V2JL5H`, iOS). Xcode offers to create it during step 4 below if it's missing.
2. In TestFlight, an internal group (Internal Testing, +), with every tester in it.
3. Xcode Cloud's access to `kiroshi-app/kiroshi-monorepo`, granted with a GitHub admin of the repo when Xcode asks.

The workflow, from Xcode:

4. `bun run ios:generate`, open `apps/ios/Kiroshi.xcodeproj`, Report navigator, Cloud, Get Started. Product: Kiroshi. Then Edit Workflow.
5. General: name it `TestFlight from main`. The project is `apps/ios/Kiroshi.xcodeproj`, the scheme `Kiroshi`.
6. Environment: Xcode `27.0`, the version in `.xcode-version`, not Latest Release. macOS: the one Xcode Cloud recommends for it. Clean: off (only external testing needs it).
7. Start Conditions: delete the suggested Pull Request Changes. Branch Changes: Source Branch, Custom Branches, `main`. Files and Folders, Custom Conditions: Start a Build, Any File, in the folder `apps/ios`, then Start a Build, Filename `.xcode-version`, in any folder. Auto-cancel Builds: off, so each merge gets its own build.
8. Actions: one Archive, platform iOS, scheme `Kiroshi`, Deployment Preparation TestFlight (Internal Testing Only).
9. Post-Actions: TestFlight Internal Testing, with the internal group from step 2. No TestFlight External Testing.
10. Save, grant access to the repository, then Start Build on `main`.

Xcode Cloud numbers builds from 1. If TestFlight already holds a `0.1.0` build uploaded by hand, set App Store Connect, Xcode Cloud, Settings, Build Number, Next Build Number above it.

### Each release

There's nothing to answer per build in App Store Connect. `project.yml` declares `ITSAppUsesNonExemptEncryption` as `NO`: the app uses standard algorithms only, through CryptoKit and the Security framework (Curve25519, ChaChaPoly, HKDF, HMAC and SHA-256, no third-party crypto library), so each build reaches TestFlight without the export compliance question.

Once a year, before 1 February, Steve files the self-classification report to BIS for the year before. A new crypto library, or an algorithm outside CryptoKit, reopens the question before it ships.

## States without the network

A Debug build opens straight on one state, fed by fixtures instead of the cloud and the relay, when launched with `-fixture` and the artboard number. Page 1 "Sign in" of the Paper file "Kiroshi, iOS 2" (`1.1` to `1.10`, `1.7b`, plus `spaces` and `spaces-unreachable`), whose Welcome, email and code states (`1.1`, `1.1b`, `1.1c`, `1.1d`, `1.2`, `1.3`) now follow page "Sign in" of the Paper file "Kiroshi, iOS Sign-in"; set the simulator to dark with `xcrun simctl ui booted appearance dark` for the `· dark` artboards:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 1.7
```

Page 2 "Accueil" of the Paper file "Kiroshi, iOS 2" is fed by a scripted host on the relay, with the artboards' Studio: Juniper, Atlas, Pico, Mira and Otto with their roles, and the group conversation Release 0.42 (Juniper, Pico and Mira). `2.1` opens on the list, `2.2` on the same screen (tap the Space button, next to your initial, to open the menu of Spaces), `2.3` on a Space without companions, `2.4` on the list still loading, `2.5` on Side project, whose host leaves two seconds after the list loads, and `2.6` on the list while Juniper works:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 2.6
```

Both lists, Conversations and Missions, share one header: your initial (it opens Settings) then the Space button (it opens the menu of Spaces), both system glass buttons at the top left, the list blurring under them through the system scroll edge effect, and the + of New Conversation top right on Conversations.

A thread hides the tab bar. Each tab hides it from its list, `ConversationsView` while a Conversation is open and `MissionsScreen` while its path holds a Mission, never from the thread itself: hidden from a pushed screen, SwiftUI brings the tab bar back only once the pop has ended, after the list. `HomeTabBarTests` goes back to the list by Back and by a swipe from a Conversation, by Back from a Mission, by closing Settings, by switching Space and from the background, and checks the tab bar is hidden in the thread and hittable in the same check as the first row. XCTest waits for the app to settle after each gesture, so the order of the frames is checked on a screen recording (`xcrun simctl io <UDID> recordVideo`), not by the test.

The Conversations list plays through a scripted host: it answers `conversation_bots`, `conversation_page` (and `conversation_list`, which an older Mac answers instead), `conversation_main_chat`, `conversation_message_page`, `conversation_send_turn`, `chat_store_attachments`, `agent_cancel_turn` and `conversation_create`, and plays the host's events. Like the Mac, its `conversation_page` lists each companion's own conversation that holds a message beside the group conversations, marked with `soloBotId`: the app lists it once, as the companion's row (avatar, name and role), never as a group, and `SoloConversationTests` checks it on `2.1`, then opens Juniper's header. The + at the top right of the Conversations tab opens New Conversation, the companions of the Space to pick from: Create sends `conversation_create` and opens the new group conversation, which the scripted host then lists and announces with `conversation://created`. `conversations` lists the six companions beside two group conversations: Release crew (Juniper and Atlas) and Design review (five companions, so the pile shows two avatars and `+3`). `conversations-live` opens on the same list, then plays a `conversation://created` (Launch plan) three seconds later, and, once Launch plan's thread is open, a `conversation://updated` renaming it Launch checklist and a `conversation://deleted`, three seconds apart:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture conversations-live
```

Page 3 "Fil" of "Kiroshi, iOS 2" opens on Juniper's thread: `3.1` (the conversation: one bubble per message of yours, a companion's message split into several, the avatar under the last bubble of a run, a `Today` separator), `3.2` (empty), `3.3` (Juniper at work, the clock counting), `3.4` (Side project, whose host leaves two seconds after the thread loads) and `3.5` (the times shown, as a swipe left shows them). Each message's time is drawn only while a swipe left slides the thread; launched with `-holdsTimes YES`, the thread stays slid after the finger lifts, which is how `KiroshiUITests` checks the gesture. The times follow the simulator's locale: `-AppleLocale en_US` gives the artboards' `9:38 AM`. Sending from any thread plays a whole turn (tool activity, which the thread never shows, a streamed reply, then the end of the turn). `working-after-reply` opens on Juniper's thread ending on her own reply while she works again: the working line shows whatever the last row is. `two-asks` opens on Juniper's thread ending on two messages of yours sent in a row, the first of several paragraphs and a list: one bubble each. `slow-thread` opens on Juniper's thread of 31 messages, more than a screen, that the host answers five seconds late, as a slow relay does, so its loading is still there whenever the test looks: the thread shows its loading, then opens on its last message. `slow-group` does the same with Release crew, Juniper and Atlas taking turns, answered two seconds late. `long-reply` opens on the same 31 messages, answered at once, and a send there streams a reply of twelve paragraphs, longer than the screen. The thread follows its bottom while you're there: on a send it follows the reply until your message reaches the top, under the header, then holds it there while the rest of the reply streams below, the working line included. It follows the bottom again once you scroll back down to it. Scrolled up to older messages, a reply streaming leaves you where you are, and a send brings you back down to your message, wherever you were. Each scripted turn names its reply after the message it answers, so a second send adds a reply instead of rewriting the first. While a thread loads it shows its loading alone, no day separator and no `Mission opened by` line. `conversations-failed` and `thread-failed` open on the screens shown when the host refuses the list or the thread. `conversations-recovering` opens on the same refused list, then the host answers every later read: Try Again, or coming back from the background, shows the list. `ConversationsRecoveryTests` audits that failure at the largest text size and checks both ways back to the list. `-draft` fills the composer of the thread a fixture opens:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.5 -AppleLocale en_US
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.1 -draft $'Line one\nLine two'
```

A companion's message is Markdown, drawn the way page "Message Markdown" of the Paper file "Kiroshi, iOS Markdown" (artboards 1 to 10, light then dark) draws it; a person's message is never parsed. `MarkdownMessage` (`Conversations/`) parses it once per text change with Foundation (`AttributedString(markdown:)`, `.full` syntax) and walks its `PresentationIntent` into blocks: headings, paragraphs, lists three deep (`[ ]` and `[x]` become read-only checks), quotes, rules, fenced code with its language, tables, and `<@id>` mentions named after the companion (`@Unknown companion` otherwise). `$…$` becomes inline code, raw HTML stays text, a footnote stays plain text with its definition moved to the end, and a ```` ```mermaid ```` or ```` ```math ```` fence stays a code block. `BubbleSplit` (`Conversations/Bubble.swift`) then splits the blocks into bubbles, as the thread split a companion's paragraphs before Markdown: each top-level block opens a bubble, except that a heading keeps what follows it, a code block or a table stays with the paragraph just before it, a paragraph ending with a colon keeps what it introduces, and a rule is a split point, never drawn (a message of rules alone keeps one bubble); a list, loose or nested, and a quote stay one bubble. Each bubble is `<message id>-<index>`, and blocks appended while a reply streams only grow the last bubble or open the next one, never move an earlier one. `MarkdownBlocksView` (`Thread/`) draws each bubble's blocks, in text styles, system colours and the bubble's Kiroshi colour: a code block or a table sits in a `card-fill` card that scrolls sideways on its own. Both cards come from `MessageCard` (`Thread/MessageCard.swift`): the `card-fill` of artboards 7 and 6c (white, `#2C2C2E` in dark, Increase Contrast included, where `tertiarySystemBackground` would turn `#363638`), a 1-point `card-stroke` edge drawn inside the card, and a header holding the code's language or the table's row count (`3 rows`) in `card-label` with a copy button in `card-copy` (`Copy code` or `Copy table`, then `Copied` for two seconds), so the two cards can't drift apart. The table's copy button copies it tab-separated, as Copy Table does. Its rows are split by a hairline (one pixel) in `card-separator`, the artboards' separator, which the system's lighter `separator` no longer matches, running from edge to edge of the card; its columns hug their widest cell, at least 56 points wide and 16 apart, 12 from the card's edges, so a narrow table gives artboard 7's 72-point slots and its spare width goes to the first column, while a wider one runs past the bubble and scrolls. The code card's copy button copies the code, highlighted by Highlightr (MIT) with its `xcode` theme, whose colours `SyntaxHighlighting` maps onto Xcode's default palette, the `syntax-*` colours of `Assets.xcassets` (light and dark, and their Increase Contrast variants from artboard 6c, which the asset catalog picks with the system setting, as it does for `card-stroke` and `card-label`). A call or a member, which highlight.js leaves untagged, takes `syntax-function`, except the name a `func`, `def`, `fn`, `fun` or `function` declares. The name a Swift `struct`, `class`, `enum` or `protocol` declares takes `syntax-type`, as `String` does: highlight.js tags it `hljs-title class_`, a compound class Highlightr's theme parser leaves uncoloured, so `SyntaxHighlighting` colours the name that follows those four keywords itself. A Swift parameter name stays plain, as the artboards draw it: highlight.js tags it `hljs-params`, which that parser leaves uncoloured too, and `SyntaxHighlighting` draws plain the `_` keyword when it's an argument label, a name and a colon after it. A long press on a table offers Copy Table (tab-separated) and Copy Message, the whole message whichever bubble holds the table; prose keeps its text selection. `markdown` opens on one artboard's replies, chosen with `-artboard 1` to `-artboard 10` (`10` when omitted, `retry` for artboards 6 and 6c's retry helper, `tables` for artboard 7's two tables, `code-and-table` for artboard 6c's code card and table), or on one reply holding every family with `-artboard all`:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture markdown -artboard all
```

`MarkdownMessageTests` (unit) covers each family; `MarkdownMessageTests` (UI) copies a code block, takes Copy Table from the long-press menu and pastes both into the composer, and audits the every-family reply, at the largest text size too.

The group thread plays Release crew (Juniper leads, Atlas): `group-thread` opens on it, each companion's messages under its name and avatar, `group-mention` opens it with `@` typed so the mention picker shows, `group-working` with Juniper and Atlas both at work, and `group-failed` on the thread refused. Picking a companion in the picker writes `@Name`, sent to the host as `<@botId>` with that companion in `summoned`; with no mention, `summoned` stays empty and the host summons the lead, as the desktop does. The scripted host answers a group send with a tool activity, not shown, then an `On it.` from each companion summoned, whose turn then ends:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture group-mention
```

A solo Conversation, a group Conversation and a Mission open the same thread screen (`Thread/ThreadScreen.swift`), built from the same header, message rows and composer; `ThreadStore` and `MissionThreadStore` stay apart behind `ThreadModel`. The header is variant A of the page "Header, explorations": the companion's avatar over a glass capsule, its name then its title (the `title` of `conversation_bots`) in a Conversation, the group's icon cell over its name in a group, `ticket · companion · title` over the mission in a Mission, the thread blurring under it through the system scroll edge effect. A companion without a title shows its name alone. Each line stays on one line, truncated, and the header stays centred in the bar whatever its length: `long-name` opens Juniper renamed Juniper Wilhelmina Fitzgerald-Montgomery, `long-group` a group with a long name. The composer is the same in all three, under the same scroll edge effect as the header: + (Photo Library, Choose File), the field, then Send, or Stop while a companion works in a Conversation. Files go to the host through `chat_store_attachments` before the message names them, in a Conversation as in a Mission. Each file goes as `{ "name", "base64" }`, the base64 encoded off the main actor, never as the `bytes` integer array the desktop sends. Before anything leaves, `AttachmentRejection` (`Core/ConversationAttachments.swift`) checks the host's limits on the picked bytes: 10 MiB a file (`maxBytes`), 20 files (`maxAttachments`) and 30 MiB together (`maxTotalBytes`); over one, Send stores nothing, sends no turn and says so above the composer. A failed send names what failed (`SendFailure`): the computer hosting this Space offline only when the relay closed the socket with 4002, the Space couldn't be reached on any other drop, too long on the call deadline, files too large or too many on a 413 or the check, a file couldn't be read on a 400 whose `kind` is `unreadable`, and something went wrong on the computer hosting this Space on a 500 or 502. `-photos 10,10,10,1` puts photos of those sizes in MiB in the composer of the thread a fixture opens, and `-storeAnswer` makes the scripted host answer `chat_store_attachments` with `unreadable` (400), `unwritable` (500), `cut` (the socket drops without 4002) or `silent` (no answer, so the call times out after 300 seconds); the scripted host refuses with `unreadable` any attachment that isn't base64. `PhotoSendingTests` sends one photo and finds it under the message, then audits the refusal of `10,10,10,1` and the `cut` failure:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.1 -photos 3 -storeAnswer cut
```

`-history YES` gives `3.1` and `5.2` the earlier messages the `scrolled` artboards draw, so the thread runs under the header:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.1 -history YES
```

`-paged YES` gives the fixtures a second page and makes the host answer short pages, still with a `nextCursor`, so the second page is one scroll away: 8 rows a page for Conversations and Missions, 10 messages for a thread (the app still asks for 30 and 50; it stops on `nextCursor: null` or `hasMore: false`, never on a short page). `conversations` (and every page 2 fixture) gets Topic 1 to Topic 7, its page two being Topic 7, the Missions tab OPE-301 to OPE-305, OPE-305 alone on page two, and Juniper's thread 10 earlier notes, Earlier note 1 alone on its older page. `5.1` and `3.1` get the same. Every page after the first comes a second late so its loading row shows (`-pageDelay 120` holds it two minutes, for a frame). `PagingTests` launches `conversations -paged YES` once: it opens Juniper and finds Earlier note 1, then scrolls Conversations to Topic 7 and Missions to OPE-305, each list ending without its loading row:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture conversations -paged YES
```

`KiroshiUITests` runs the accessibility audit on every state of page 1 (`1.1` to `1.10`, `1.1b`, `1.1c`, `1.1d`, `1.7b`), taps the email field of `1.1` and checks every action stays above the keyboard, scrolls `1.1` to Continue with Google at the largest text size, then runs it on 2.1, 2.3, 2.4, 2.5, 2.6, `conversations`, and every state of page 3 (`3.1` to `3.5`), swipes left on `3.1` to bring the times in, sends from `3.1` and checks no element names the agent's tools while the turn runs or after, audits `two-asks` and checks each of its paragraphs stays in its message's one bubble, scrolls `3.1` up at the largest text size, opens `slow-thread` twice and `slow-group` again from its list, and checks each open shows the loading, without a day separator, then lands on the last message with no scroll, sends in `long-reply` with the keyboard down and up and checks your message stays on screen, between the header and the composer, once the reply is longer than the screen, checks that scrolling up while the reply streams leaves you where you are, that a send from older messages brings your message into view, and that the next send after a held reply comes back to the bottom, opens the menu of Spaces on 2.1, checks both tabs of 2.1 show the same header (your initial and the Space button, at the same place) and opens the menu of Spaces from Missions, and from 2.1 creates a group conversation with the + and runs the audit on New Conversation, as part of `bun run ios:test`.

The same fixtures feed the `#Preview`s.

Page 5 "Missions" of "Kiroshi, iOS 2" opens on the Missions tab: `5.1` (the grouped list of Studio), `5.2` (the thread of OPE-212, in the bubbles of page 3, with the composer), `5.3` (no missions) and `5.4` (Side project answers its list, then its host leaves). `slow-mission` opens on the thread of OPE-212 that the host answers two seconds late, as a slow relay does: the thread shows its loading, then the mission. The scripted socket answers `mission_space_page`, `conversation_bots`, `conversation_message_page`, `chat_store_attachments`, `agent_pending_questions` and `conversation_send_turn`, so sending in `5.2` goes through the real store and relay connection; Atlas then works for nine seconds (a running turn, a tool, then the end of the turn). `mission-working` opens on OPE-212 with Atlas already at work, its own question the last row. A swipe left in the thread shows each message's time, and `-holdsTimes YES` keeps it slid as on page 3:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 5.2 -AppleLocale en_US -holdsTimes YES
```

`KiroshiUITests` runs the accessibility audit on `5.1`, `5.3` and `5.4`, opens OPE-212 from `5.1` and audits it as `5.2` draws it, then swipes left to bring the times in. `MissionOpeningTests` opens `slow-mission`, goes back, opens OPE-212 again and checks it shows the loading, without the `Today` separator, then the thread. `ThreadHeaderTests` opens Juniper, Shoto, Release crew and OPE-212 from their lists and reads each header: `Juniper, Writer`, `Shoto`, `Release crew`, `OPE-212 · Atlas · Planner, Split the onboarding flow`; checks `3.1`, `group-thread` and `5.2` show the same header and composer; and checks `long-name` and `long-group` keep their name on one line, centred.

A Conversation's missions: the flag at the top right of a solo or group Conversation pushes Missions, the same `MissionsList` as the Missions tab (`MissionsStore.sections(in:)` keeps only the missions opened in that conversation), in the Conversations tab's typed path (`ConversationsRoute`); a row opens the mission's thread, Back returns to the Conversation. Page 2's host answers `mission_space_page` with three missions in Release 0.42 (OPE-215, OPE-218, OPE-209) and one in Juniper's conversation (OPE-220). `missions-button` opens on Release 0.42's thread, `conversation-missions` on its missions, `conversation-no-missions` on Atlas's, which has none:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture conversation-missions
```

`ConversationMissionsTests` opens Release 0.42 from `2.1`, taps Missions, checks only its three missions show, audits the list, opens OPE-209 and comes back to the thread, then audits `conversation-no-missions`.

## Settings and Sign out without the network

Page 6 "Réglages" of "Kiroshi, iOS 2" is the sheet your initial, top left of the Conversations and Missions tabs, presents. `6.1` opens on the Settings sheet, `6.2` on its Sign out confirmation; both sign in Sam with three spaces (Studio, Home lab, Side project) kept in memory and answer Sign out, so confirming lands on Welcome:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 6.2
```

Between your email and Sign out, Privacy Policy (in the section `Where your messages go`), Terms of Use and Support open `https://kiroshi.app/privacy`, `/terms` and `/support` (`KiroshiPage`) in an `SFSafariViewController` over the app, which its Close dismisses.

`KiroshiUITests` opens the sheet from both tabs of `2.1`, checks `6.1` opens it once, on Conversations only, opens each of the three pages from `6.1` and closes it, cancels then confirms Sign out from `6.2`, and runs the accessibility audit on `6.1` and `6.2`.

Delete account sits under Sign out, in its own section. It asks once (`Delete your account?`), then calls the cloud's `DELETE /me` with the bearer (`KiroshiCloud.deleteAccount(bearer:)`). A `204`, or a `401` from an account already gone, ends the session the way Sign out does and also forgets the last Space and this account's agreement, so nothing of it stays on the iPhone. Any other answer keeps everything and shows `Couldn’t delete your account. Check your connection and try again.` under the row; tapping it again tries again. While the call runs the row shows its progress and can't be tapped. `6.1` and `6.2` answer `DELETE /me` with `204`, `delete-account` opens on its confirmation, `deleting-account` on the call still running, and `delete-account-failed` on the failure line, the cloud answering `500`. `-requestLog <path>` makes the scripted cloud append each request it gets (`DELETE /me`) to that file, which is how `DeleteAccountTests` counts the calls:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture delete-account-failed -requestLog /tmp/requests.log
```

`DeleteAccountTests` deletes the account from `6.1` through its confirmation, lands on Welcome after exactly one `DELETE /me`, then opens `delete-account-failed`, tries again from the row and checks the session and Settings stay, with the failure line. The version ends the list, under Delete account, so it never covers a row: `SettingsLargestTextTests` opens `delete-account-failed` at the largest text size, scrolls Settings to its end, checks every row and the failure line show whole, none under the version, then audits it.

Two more Debug fixtures keep the real Keychain and script the cloud (three spaces, Sign out answered), so signing out really empties the Keychain:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain-seeded  # Writes a fixture session to the Keychain, opens on the Space screen
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain         # Opens on whatever the Keychain holds
```

Tap your initial, then Sign out. Relaunched with `-fixture keychain` after confirming, the app opens on Sign in: no session is left on the device.

## Where your messages go

Sign-in goes straight to the spaces: nothing about where messages go shows there. The first Send of an account that hasn't agreed yet on this iPhone stops before anything reaches the relay, files included, and opens the half sheet `Where your messages go` over the Conversation (`MessageConsentSheet`, artboard "D · Half sheet" of the Paper file "Kiroshi, iOS AI consent"): its messages reach the Mac through the relay, then the agent, which sends them to the model provider your Mac uses. `Agree and send` records the account in `UserDefaults` (`messageRoutingAgreements`, `UserDefaultsAgreementStore`), keyed by the cloud's user id, or the email for a session an older build saved, closes the sheet and sends the message once; that account is never asked again on this iPhone. `Not now`, or swiping the sheet down, sends nothing, keeps the draft in the composer and the person signed in, and shows `Not sent. Your draft stays here.` above it ("State · Not now, draft kept"); the next Send asks again. The same gate (`SendGate`, one per thread, reading the account's `MessageConsent`) guards a Conversation, a group and a Mission. At the accessibility text sizes the sheet opens at the large detent so its text scrolls above both actions.

Settings holds the section `Where your messages go` ("Settings · Where your messages go"): `Send messages to the agent` shows the stored agreement, and turning it off withdraws it, so the next Send asks again. Once off, the toggle stays off until the next `Agree and send`. Its Privacy Policy row is the only one in Settings. It shows again on a new device, after a reinstall or for another account. The cloud doesn't know about the agreement. Every fixture has agreed already except `agreement`, which opens on Juniper's empty Conversation with a draft typed ("0 · Draft typed, before Send"), and `keychain` and `keychain-seeded`, which read the real `UserDefaults` and open on the spaces whatever it holds:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture agreement
```

`MessageConsentTests` sends from `agreement` and audits the sheet, at the largest text size too, agrees and sends once, then sends again without the sheet, takes Not now and swipes the sheet down, and turns the setting off from `3.2` before sending again.

## Sign in with Apple and Google

Welcome (`WelcomeView`) offers the email, then Sign in with Apple and Continue with Google. Both send the provider's ID token to the cloud's `POST /api/auth/sign-in/social` (`KiroshiCloud.signIn(with:)`), which answers the session body of the email code: the bearer goes to the Keychain the same way. Apple is AuthenticationServices' own `SignInWithAppleButton` (black in light, white in dark, clipped to the Google button's capsule and height): Apple draws its logo and title centred together, where the artboard puts the logo in the left slot as Google's. It hands Apple the SHA-256 of a fresh nonce (`Nonce`) whose raw value goes to the cloud with the token, the credential's `authorizationCode` (decoded as UTF-8, read from the credential of that sheet only, never stored, so a new attempt goes through the Apple sheet again) and, on the first authorization only, the full name. The relay exchanges that code for a refresh token it revokes when the account is deleted; its JSON name is the `authorizationCode` case of `IdTokenSignIn.CodingKeys` in `Core/KiroshiCloud.swift`, and a Google sign-in never sends it. Google is GoogleSignIn-iOS (`GoogleSignInAuthorizer`, behind `GoogleAuthorizing`), its `serverClientID` the cloud's web client so the token's audience matches. A cancelled sheet goes back silently; a refused token says so under the buttons.

- `GOOGLE_IOS_CLIENT_ID` in `project.yml` is the iOS OAuth client of Google Cloud without its `.apps.googleusercontent.com` suffix; `GIDClientID` and the reversed URL scheme are built from it.
- The app target carries the `com.apple.developer.applesignin` entitlement, so the App ID needs the Sign in with Apple capability.
- `Kiroshi/Resources/PrivacyInfo.xcprivacy`, declared in `project.yml`, is the app's privacy manifest: no tracking, the email address, name, user ID and messages (other user content) collected for the app's functionality and linked to the person, and `UserDefaults` read for reason `CA92.1` (the last Space shown, the accounts that agreed to where messages go, the Debug fixture arguments). GoogleSignIn and its dependencies ship their own manifests.
- `Package.resolved` pins the Swift packages. Every generate copies it into the project, since Xcode Cloud resolves none on its own: after changing a package, resolve in Xcode and copy `Kiroshi.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` back. The packages check out under `build/` in CI, in the shared cache on a Mac (see above); every generate marks `build/` for `swift format` to skip.

`1.1b` and `1.1c` hold the tapped button's loading while the cloud's answer is pending, `1.1d` shows the cloud refusing the Apple token:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 1.1d
```

## The relay

`RelayConnection` is the one place the app talks to the relay member socket of the current Space (`docs/relay/member-socket.md`). Read its state and events with `updates()`, and send a call with `call(_:args:)`: the answer bearing the call's id comes back as a `RelayAnswer`. `SpaceStore.connection` is the connection of the Space shown.

## Who's working

A companion works in a conversation from the moment the host says so until its turn ends, the Mac's rule for a turn it didn't start (`apps/app/src/lib/conversations/foreign-turns.ts`): an `agent://event` with a `scope` and a `turn` opens the work on a busy `turnChanged` (`submitting`, `running`, `stopping`), an `activity`, a `permissionRequested` or a `questionRequested`, and closes it on `turnEnded` or `failed`. An idle `turnChanged`, a message started, streamed or completed change nothing: a question still pending keeps the companion at work. The turn is known by its run (`runtimeSessionId` and `epoch`), so two companions work side by side in a group.

`CompanionWork` holds this for the Space shown: `SpaceStore` feeds it from the member socket, so it lives across navigation, and forgets everyone when the socket drops, since the relay replays nothing. A solo, group or mission thread only reads it for its conversation, and on opening asks the host `agent_pending_questions` for a question asked before the thread was there. The thread then shows the working line at its bottom, above the composer (with Stop in a Conversation's composer, never a Mission's), and the working companion's avatar moves, in the working line and in the header, still at rest and under Reduce Motion. VoiceOver announces `Juniper is working…` when the work starts. The last message decides nothing.

The Conversations list computes none of it: each row reads the `state` the host computed (`idle`, `working`, `needs_you`) on its `conversation_page` row, then every `conversation://state-changed` for its conversation. `working` moves the avatar and reads `Now` and `working…`, in a group too, without naming a companion, since the host names none; `needs_you` reads `Now` and `Needs you` in system orange before the last message. A value the iPhone doesn't know reads as `idle`, and so does a row the host gave no state (an older Mac, or a companion's own conversation read through `conversation_main_chat`) until its first change. A page read again refreshes the state of the rows already shown.

## Questions

When the agent asks (`questionRequested`, page "v4 Sticky" of the Paper file "Kiroshi, iOS, Questions"), the question waits in a panel fixed to the bottom of the thread, in place of the composer, until it's answered: `QuestionPanel` in the thread's `.safeAreaBar(edge: .bottom)`, edge to edge, its top corners rounded, so the thread keeps its system scroll, scroll edge effect and keyboard avoidance. One to four questions, each with its header, its text whole, its options (label and description, a check for one, a circle for several), `Write your own answer…`, Skip and Send, or Next while another question still waits, the questions under a row of segments when there are several, each one a button, a green ✓ before those already answered (4.5). The question scrolls inside the panel once it's taller than the room above the keyboard or at the largest text sizes, Skip and Send staying in view (4.4). Scrolled up from the end of the thread, an opaque round ↓ 10 pt above the panel (`Latest message`) brings it back down (4.8). VoiceOver moves to the question when the panel comes; under Reduce Motion it fades in instead of sliding up. The thread shows nothing where the host stored the question's row (`question-<id>`) while it waits, never a bubble, and the working line and Stop step aside. `CompanionWork` keeps the waiting question of each conversation, from the live event or from `agent_pending_questions`, which a thread asks on opening and the Conversations list asks for each row whose page row has an `activeTurn`, on every reconnection, so coming back from the background brings it back. A question settled while that replay is in flight (`permissionResolved`, the end of its turn) stays settled.

Send calls `agent_answer_question` with one answer per question, keyed by its text, as the Mac does: the picked label, the labels joined by `, ` in pick order for several, or the typed text, which replaces the picks. Then `conversation_append_user_message` records the answer, replying to `question-<id>`, in the question's turn: the panel goes, the composer comes back, and the thread shows `You answered` and the answers where the question's row is (4.6). Skip sends no answer and the thread shows `You skipped`. Nothing leaves from the composer while a question waits, since the panel takes its place. An answer from another device (`permissionResolved` without this iPhone's answer) gives the composer back and shows `Answered on another device`, then its answers once the answer row is stored (4.7); a question dropped at the end of its turn gives the composer back and leaves nothing. The Conversations row reads `Needs you` from the host's `needs_you` state (2.1), followed by the conversation's last message: the host doesn't send the question with the state.

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture questions-4.1   # also questions-2.1, questions-4.3, questions-4.5, questions-4.7
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture questions-4.1 -history YES   # 4.8, once scrolled up
```

`questions-4.1` opens Juniper's thread on a single question, `questions-4.3` on several options, `questions-4.5` on three questions, `questions-4.7` on a question the Mac answers three seconds later, `questions-2.1` on the list with Juniper waiting on you and Atlas at work, both from the state of their page row; `-history YES` gives the thread the earlier messages 4.8 scrolls up to. `QuestionPanelTests` picks, types, skips and sends from them, checks the composer is gone while the question waits and back after, audits each state the artboards draw and keeps a screenshot of each.

## Missions

The Missions tab reads `mission_space_page` for the shared Space and places each mission by the `liveness` the host observed, then by every `mission://changed`: Needs you (`needs_you`), Working (`working`, and `idle`, which page 5 doesn't draw, with a still avatar and its written status), Review (`ready_to_merge`). `failed`, `done` and `closed` have no group on page 5 and are not shown. Only `working` moves the avatar and reads `Working now`. A mission without a `liveness` the iPhone knows (an older Mac) is placed by its stored `state` as before: Needs you (`waiting_human`), Working (`working`, `waiting_bot`), Review (`ready_to_merge`), its avatar moving while `isAgentRunning`. A mission's thread is its thread conversation (`conversation_message_page`), drawn with the Conversation thread's bubbles under a `Mission opened by` line at the mission's `openedAt`, read again when the companion speaks there, when the agent finishes a message or a turn there, and on every reconnection; an answer goes out with `conversation_send_turn`, files first through `chat_store_attachments`.

## Pages

Conversations and Missions read their lists 30 rows at a time: page one on opening, on pull to refresh and on every reconnection, then the next page from the `nextCursor` of the last one when a row five from the end appears, until `nextCursor` is `null`. While a page is read the list ends with a `ProgressView` row; a page refused ends it with `Couldn’t load more. Try again.` and Try Again, the rows already read staying. A cursor the Mac can't read (`unreadableCursor`) rereads page one. A Mac that doesn't know `conversation_page` or `mission_space_page` refuses it as a host command (403, `this command belongs to the host`): the store then reads `conversation_list` or `mission_space_feed`, the whole list, until another Space opens.

`conversation_page` lists group conversations only, pinned ones first (page one only, in pin order), then by last activity, each with its `lastWord`, so a group row costs no call of its own. The row's preview names who wrote that last word, by the thread's own rule (`ThreadAuthorship`): `You:` for yours, the member's name for another person (their `authorName`), the companion's name in a group, nothing in a companion's own row, nor for a companion that isn't a member or a word that names no one (an older Mac). `shared-list` opens Home lab, a Space you joined, on the five cases. A companion's own conversation isn't in it: `conversation_bots` lists the companions, then each companion costs `conversation_main_chat` and a `conversation_message_page` of one message for its preview, as before. A companion row waits for the page its last activity falls in, so the order never jumps. A message in a conversation not read yet rereads page one and adds what's new, keeping the pages read; the same goes for a `mission://changed`.

A Conversation thread opens on its last 50 messages; reaching the top reads the 50 before the oldest one held (`beforeSeq`), until `hasMore` is `false`, with a `ProgressView` at the top meanwhile. The message at the top of the screen stays where it is when the older page lands: SwiftUI doesn't keep a `LazyVStack`'s position on a prepend on iOS 27, so the thread scrolls back to the message `ThreadAnchor` picks. `ThreadAnchorTests` cover that choice; no UI test measures the scroll itself.

## Pinned conversations

The conversations pinned on the Mac sit in a strip of avatars above the Conversations list (artboard D of page "Épinglés, explorations"), in the host's pin order: the `pinned` rows of `conversation_page`, plus each companion `conversation_bots` gives a `pinPosition` whose own conversation isn't on the page. The list below holds the rest, by last activity. A tap on an avatar opens its conversation; a long press offers Unpin (a `Menu` with a primary action, since a `.contextMenu` inside a `List` row belongs to the whole row). A swipe right on a row offers Pin, the system swipe action. A Mac without `conversation_page` pins nothing and offers no swipe.

`roster_pin` replaces the Space's whole pin list (sections, companions, conversations), so pin and unpin first read it back from the host (`section_list`, `conversation_bots`, the pinned rows of `conversation_page`), rebuild it as the desktop does (`RosterPins`, after `roster-pins.ts`), append or remove the one row, keep the order, send it, then read page one again. Nothing moves before the host answers; a refusal shows `Couldn’t pin Atlas.` with the gesture to try again.

`pinned` opens on Juniper, Release 0.42 and Otto pinned; the scripted host keeps the list it's sent and refuses one that repeats it, so a second `roster_pin` for the same swipe shows the refusal. `pin-refused` refuses every pin. `PinnedStripTests` checks the strip's order and the list, audits it, opens Release 0.42 from the strip, unpins Otto, and pins Atlas with a swipe:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture pinned
```

`pinned-icons` pins Juniper, Sidebar width resets after restart (PanelLeft, no colour) and Relay audit: session tokens (ShieldKey, red), all three without a message, and `-opening` opens one of them, header over its empty thread: the companion's avatar, then the conversation's icon cell, as page "Everywhere" draws them:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture pinned-icons -opening group-relay-audit
```

An empty thread scrolls when its content outgrows the screen, centred while it fits, so a long name at the largest text size keeps the hero under the header and lets the text grow. `-emptyThread YES` empties the conversation a fixture opens: `long-name -emptyThread YES` is Juniper Wilhelmina Fitzgerald-Montgomery's empty thread, which `ThreadAccessibilityTests` audits with the group one:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture long-name -emptyThread YES
```

## Companion avatars

`CompanionAvatar` draws what the desktop draws: `CompanionAvatarEngine` runs `Kiroshi/Resources/companion-avatar.js` (built from `packages/ui` by `bun run avatar:build`, never edited by hand) in JavaScriptCore, caches the idle drawing per name, tint and theme, and computes a frame at 30 fps while the companion works, idle under Reduce Motion. A companion with a picture shows it once `relay_avatar` answers; until then, or when it fails, the drawn avatar stays. `CompanionAvatarTests` replays every case of `packages/ui/src/components/companion-avatar.fixture.jsonl` from the repo, so `bun run ios:test` fails when the bundle and the fixture part ways. In the Conversations fixtures, Shoto has a picture and Otto no tint.

A group conversation is identified by its subject icon cell (`ConversationIconCell`, page "Everywhere" of "Kiroshi, Conversation icons") wherever it's named: its list row (52 pt), its pinned chip (56 pt), its thread header (52 pt) and its empty thread (88 pt), all scaled from the same cell. A companion's own conversation keeps `CompanionAvatar` in those places. `ConversationAvatar` picks one or the other from the subject, and an icon or colour changed on the Mac (`conversation://updated`) repaints them while the screen stays open. The bots' pile shows on the list row only.
