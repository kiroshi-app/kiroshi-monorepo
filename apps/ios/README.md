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

The Conversations list plays through a scripted host: it answers `conversation_bots`, `conversation_page` (and `conversation_list`, which an older Mac answers instead), `conversation_main_chat`, `conversation_message_page`, `conversation_send_turn`, `chat_store_attachments`, `agent_cancel_turn` and `conversation_create`, and plays the host's events. Like the Mac, its `conversation_page` lists each companion's own conversation that holds a message beside the group conversations, marked with `soloBotId`: the app lists it once, as the companion's row (avatar, name and role), never as a group, and `SoloConversationTests` checks it on `2.1`, then opens Juniper's header. The + at the top right of the Conversations tab opens New Conversation, the companions of the Space to pick from: Create sends `conversation_create` and opens the new group conversation, which the scripted host then lists and announces with `conversation://created`. `conversations` lists the six companions beside two group conversations: Release crew (Juniper and Atlas) and Design review (five companions, so the Hive shows two cells and `+3`). `conversations-live` opens on the same list, then plays a `conversation://created` (Launch plan) three seconds later, and, once Launch plan's thread is open, a `conversation://updated` renaming it Launch checklist and a `conversation://deleted`, three seconds apart:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture conversations-live
```

Page 3 "Fil" of "Kiroshi, iOS 2" opens on Juniper's thread: `3.1` (the conversation: one bubble per paragraph of a companion, one bubble per message of yours, the avatar under the last bubble of a run, a `Today` separator), `3.2` (empty), `3.3` (Juniper at work, the clock counting), `3.4` (Side project, whose host leaves two seconds after the thread loads) and `3.5` (the times shown, as a swipe left shows them). Each message's time is drawn only while a swipe left slides the thread; launched with `-holdsTimes YES`, the thread stays slid after the finger lifts, which is how `KiroshiUITests` checks the gesture. The times follow the simulator's locale: `-AppleLocale en_US` gives the artboards' `9:38 AM`. Sending from any thread plays a whole turn (tool activity, which the thread never shows, a streamed reply, then the end of the turn). `working-after-reply` opens on Juniper's thread ending on her own reply while she works again: the working line shows whatever the last row is. `two-asks` opens on Juniper's thread ending on two messages of yours sent in a row, the first of several paragraphs and a list: one bubble each. `slow-thread` opens on Juniper's thread of 31 messages, more than a screen, that the host answers five seconds late, as a slow relay does, so its loading is still there whenever the test looks: the thread shows its loading, then opens on its last message. `slow-group` does the same with Release crew, Juniper and Atlas taking turns, answered two seconds late. `long-reply` opens on the same 31 messages, answered at once, and a send there streams a reply of twelve paragraphs, longer than the screen. The thread follows its bottom while you're there: on a send it follows the reply until your message reaches the top, under the header, then holds it there while the rest of the reply streams below, the working line included. It follows the bottom again once you scroll back down to it. Scrolled up to older messages, a reply streaming leaves you where you are, and a send brings you back down to your message, wherever you were. Each scripted turn names its reply after the message it answers, so a second send adds a reply instead of rewriting the first. While a thread loads it shows its loading alone, no day separator and no `Mission opened by` line. `conversations-failed` and `thread-failed` open on the screens shown when the host refuses the list or the thread. `conversations-recovering` opens on the same refused list, then the host answers every later read: Try Again, or coming back from the background, shows the list. `ConversationsRecoveryTests` audits that failure at the largest text size and checks both ways back to the list. `-draft` fills the composer of the thread a fixture opens:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.5 -AppleLocale en_US
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 3.1 -draft $'Line one\nLine two'
```

The group thread plays Release crew (Juniper leads, Atlas): `group-thread` opens on it, each companion's messages under its name and avatar, `group-mention` opens it with `@` typed so the mention picker shows, `group-working` with Juniper and Atlas both at work, and `group-failed` on the thread refused. Picking a companion in the picker writes `@Name`, sent to the host as `<@botId>` with that companion in `summoned`; with no mention, `summoned` stays empty and the host summons the lead, as the desktop does. The scripted host answers a group send with a tool activity, not shown, then an `On it.` from each companion summoned, whose turn then ends:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture group-mention
```

A solo Conversation, a group Conversation and a Mission open the same thread screen (`Thread/ThreadScreen.swift`), built from the same header, message rows and composer; `ThreadStore` and `MissionThreadStore` stay apart behind `ThreadModel`. The header is variant A of the page "Header, explorations": the companion's avatar over a glass capsule, its name then its title (the `title` of `conversation_bots`) in a Conversation, the group's Hive over its name in a group, `ticket · companion · title` over the mission in a Mission, the thread blurring under it through the system scroll edge effect. A companion without a title shows its name alone. Each line stays on one line, truncated, and the header stays centred in the bar whatever its length: `long-name` opens Juniper renamed Juniper Wilhelmina Fitzgerald-Montgomery, `long-group` a group with a long name. The composer is the same in all three, under the same scroll edge effect as the header: + (Photo Library, Choose File), the field, then Send, or Stop while a companion works in a Conversation. Files go to the host through `chat_store_attachments` before the message names them, in a Conversation as in a Mission. `-history YES` gives `3.1` and `5.2` the earlier messages the `scrolled` artboards draw, so the thread runs under the header:

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

`KiroshiUITests` opens the sheet from both tabs of `2.1`, checks `6.1` opens it once, on Conversations only, cancels then confirms Sign out from `6.2`, and runs the accessibility audit on `6.1` and `6.2`.

Delete account sits under Sign out, in its own section. It asks once (`Delete your account?`), then calls the cloud's `DELETE /me` with the bearer (`KiroshiCloud.deleteAccount(bearer:)`). A `204`, or a `401` from an account already gone, ends the session the way Sign out does and also forgets the last Space and this account's agreement, so nothing of it stays on the iPhone. Any other answer keeps everything and shows `Couldn’t delete your account. Check your connection and try again.` under the row; tapping it again tries again. While the call runs the row shows its progress and can't be tapped. `6.1` and `6.2` answer `DELETE /me` with `204`, `delete-account` opens on its confirmation, `deleting-account` on the call still running, and `delete-account-failed` on the failure line, the cloud answering `500`. `-requestLog <path>` makes the scripted cloud append each request it gets (`DELETE /me`) to that file, which is how `DeleteAccountTests` counts the calls:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture delete-account-failed -requestLog /tmp/requests.log
```

`DeleteAccountTests` deletes the account from `6.1` through its confirmation, lands on Welcome after exactly one `DELETE /me`, then opens `delete-account-failed`, tries again from the row and checks the session and Settings stay, with the failure line.

Two more Debug fixtures keep the real Keychain and script the cloud (three spaces, Sign out answered), so signing out really empties the Keychain:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain-seeded  # Writes a fixture session to the Keychain, opens on the Space screen
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture keychain         # Opens on whatever the Keychain holds
```

Tap your initial, then Sign out. Relaunched with `-fixture keychain` after confirming, the app opens on Sign in: no session is left on the device.

## Where your messages go

Before the spaces load, a signed-in account that hasn't agreed yet on this iPhone gets the sheet `Where your messages go` (`AgreementSheet`, no artboard): its messages reach the Mac through the relay, then the model provider the Mac uses. `I agree` records the account in `UserDefaults` (`messageRoutingAgreements`, `UserDefaultsAgreementStore`), keyed by the cloud's user id, or the email for a session an older build saved, then loads the spaces; `Not now` signs out to Welcome. It shows again on a new device, after a reinstall or for another account. The cloud doesn't know about the agreement. Every fixture has agreed already except `agreement`, which opens on the sheet, and `keychain` and `keychain-seeded`, which read the real `UserDefaults`:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture agreement
```

`AgreementSheetTests` audits the sheet, at the largest text size too, and takes both ways out of it.

## Sign in with Apple and Google

Welcome (`WelcomeView`) offers the email, then Sign in with Apple and Continue with Google. Both send the provider's ID token to the cloud's `POST /api/auth/sign-in/social` (`KiroshiCloud.signIn(with:)`), which answers the session body of the email code: the bearer goes to the Keychain the same way. Apple is the system `SignInWithAppleButton`, handed the SHA-256 of a fresh nonce (`Nonce`) whose raw value goes to the cloud with the token and, on the first authorization only, the full name. Google is GoogleSignIn-iOS (`GoogleSignInAuthorizer`, behind `GoogleAuthorizing`), its `serverClientID` the cloud's web client so the token's audience matches. A cancelled sheet goes back silently; a refused token says so under the buttons.

- `GOOGLE_IOS_CLIENT_ID` in `project.yml` is the iOS OAuth client of Google Cloud without its `.apps.googleusercontent.com` suffix; `GIDClientID` and the reversed URL scheme are built from it.
- The app target carries the `com.apple.developer.applesignin` entitlement, so the App ID needs the Sign in with Apple capability.
- `Package.resolved` pins the Swift packages. Every generate copies it into the project, since Xcode Cloud resolves none on its own: after changing a package, resolve in Xcode and copy `Kiroshi.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` back. The packages check out under `build/`, which every generate marks for `swift format` to skip.

`1.1b` and `1.1c` hold the tapped button's loading while the cloud's answer is pending, `1.1d` shows the cloud refusing the Apple token:

```bash
xcrun simctl launch --terminate-running-process booted com.kiroshi.app.ios -fixture 1.1d
```

## The relay

`RelayConnection` is the one place the app talks to the relay member socket of the current Space (`docs/relay/member-socket.md`). Read its state and events with `updates()`, and send a call with `call(_:args:)`: the answer bearing the call's id comes back as a `RelayAnswer`. `SpaceStore.connection` is the connection of the Space shown.

## Who's working

A companion works in a conversation from the moment the host says so until its turn ends, the Mac's rule for a turn it didn't start (`apps/app/src/lib/conversations/foreign-turns.ts`): an `agent://event` with a `scope` and a `turn` opens the work on a busy `turnChanged` (`submitting`, `running`, `stopping`), an `activity`, a `permissionRequested` or a `questionRequested`, and closes it on `turnEnded` or `failed`. An idle `turnChanged`, a message started, streamed or completed change nothing: a question still pending keeps the companion at work. The turn is known by its run (`runtimeSessionId` and `epoch`), so two companions work side by side in a group.

`CompanionWork` holds this for the Space shown: `SpaceStore` feeds it from the member socket, so it lives across navigation, and forgets everyone when the socket drops, since the relay replays nothing. The Conversations list reads it for each row (the avatar, `Now` and `working…`), and a solo, group or mission thread only reads it for its conversation, and on opening asks the host `agent_pending_questions` for a question asked before the thread was there. The thread then shows the working line at its bottom, above the composer (with Stop in a Conversation's composer, never a Mission's), and the working companion's avatar moves, in the working line and in the header, still at rest and under Reduce Motion. VoiceOver announces `Juniper is working…` when the work starts. The last message decides nothing.

## Missions

The Missions tab reads `mission_space_page` for the shared Space and places each mission by its `state`: Needs you (`waiting_human`), Working (`working`, `waiting_bot`), Review (`ready_to_merge`). `failed`, `done` and `closed` have no group on page 5 and are not shown. A mission's thread is its thread conversation (`conversation_message_page`), drawn with the Conversation thread's bubbles under a `Mission opened by` line at the mission's `openedAt`, read again when the companion speaks there, when the agent finishes a message or a turn there, and on every reconnection; an answer goes out with `conversation_send_turn`, files first through `chat_store_attachments`.

## Pages

Conversations and Missions read their lists 30 rows at a time: page one on opening, on pull to refresh and on every reconnection, then the next page from the `nextCursor` of the last one when a row five from the end appears, until `nextCursor` is `null`. While a page is read the list ends with a `ProgressView` row; a page refused ends it with `Couldn’t load more. Try again.` and Try Again, the rows already read staying. A cursor the Mac can't read (`unreadableCursor`) rereads page one. A Mac that doesn't know `conversation_page` or `mission_space_page` refuses it as a host command (403, `this command belongs to the host`): the store then reads `conversation_list` or `mission_space_feed`, the whole list, until another Space opens.

`conversation_page` lists group conversations only, pinned ones first (page one only, in pin order), then by last activity, each with its `lastWord`, so a group row costs no call of its own. A companion's own conversation isn't in it: `conversation_bots` lists the companions, then each companion costs `conversation_main_chat` and a `conversation_message_page` of one message for its preview, as before. A companion row waits for the page its last activity falls in, so the order never jumps. A message in a conversation not read yet rereads page one and adds what's new, keeping the pages read; the same goes for a `mission://changed`.

A Conversation thread opens on its last 50 messages; reaching the top reads the 50 before the oldest one held (`beforeSeq`), until `hasMore` is `false`, with a `ProgressView` at the top meanwhile. The message at the top of the screen stays where it is when the older page lands: SwiftUI doesn't keep a `LazyVStack`'s position on a prepend on iOS 27, so the thread scrolls back to the message `ThreadAnchor` picks. `ThreadAnchorTests` cover that choice; no UI test measures the scroll itself.

## Companion avatars

`CompanionAvatar` draws what the desktop draws: `CompanionAvatarEngine` runs `Kiroshi/Resources/companion-avatar.js` (built from `packages/ui` by `bun run avatar:build`, never edited by hand) in JavaScriptCore, caches the idle drawing per name, tint and theme, and computes a frame at 30 fps while the companion works, idle under Reduce Motion. A companion with a picture shows it once `relay_avatar` answers; until then, or when it fails, the drawn avatar stays. `CompanionAvatarTests` replays every case of `packages/ui/src/components/companion-avatar.fixture.jsonl` from the repo, so `bun run ios:test` fails when the bundle and the fixture part ways. In the Conversations fixtures, Shoto has a picture and Otto no tint.

A group conversation's icon is the desktop Hive: `CompanionAvatarEngine` calls `hiveLayout` from the same bundle for every cell's centre and side and the `+N` counter, and each cell is the companion's own avatar. `HiveLayoutTests` replays `packages/ui/src/components/hive-layout.fixture.jsonl` from the repo the same way.
