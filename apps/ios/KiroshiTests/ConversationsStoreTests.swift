import Foundation
import Observation
import Synchronization
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ConversationsStoreTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let juniper = Companion(id: "juniper", name: "Juniper")
    let atlas = Companion(id: "atlas", name: "Atlas")
    let pico = Companion(id: "pico", name: "Pico")

    func makeConnection() -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock),
            backoff: Backoff(jitter: { $0 }))
    }

    func waitUntil(_ condition: @escaping @MainActor @Sendable () -> Bool) async {
        for await isMet in Observations({ condition() }) where isMet {
            return
        }
    }

    func follow(_ host: TestHost) async -> (ConversationsStore, RelayConnection, Task<Void, Never>)
    {
        let connection = makeConnection()
        let store = ConversationsStore()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.phase == .loaded }
        return (store, connection, following)
    }

    var host: TestHost {
        TestHost(
            companions: [juniper, atlas, pico],
            messages: [
                "chat-juniper": [
                    TestHost.message(
                        "j1", in: "chat-juniper", seq: 1, isYours: false,
                        "The release notes are drafted.", at: 2_000)
                ],
                "chat-atlas": [
                    TestHost.message(
                        "a1", in: "chat-atlas", seq: 1, isYours: true,
                        "Can you split the onboarding ticket in two?", at: 3_000)
                ],
            ])
    }

    @Test func listsTheCompanionsOfTheSharedSpaceNewestConversationFirst() async throws {
        let host = host
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.map(\.subject.title) == ["Atlas", "Juniper", "Pico"])
        #expect(
            store.summaries.map(\.conversationId) == ["chat-atlas", "chat-juniper", "chat-pico"])
        #expect(
            store.summaries[0].lastMessage?.line
                == "You: Can you split the onboarding ticket in two?")
        #expect(store.summaries[1].lastMessage?.line == "The release notes are drafted.")
        #expect(store.summaries[1].lastMessage?.sentAt == Date(milliseconds: 2_000))
        #expect(store.summaries[2].lastMessage == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func asksForTheCompanionsOfTheSpaceTheHostShares() async throws {
        let host = host
        let connection = makeConnection()
        let store = ConversationsStore()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)

        let call = try #require(await host.nextCall("conversation_bots"))

        #expect(try call.args(as: SpaceArgs.self).spaceId == "s-1")
        following.cancel()
        await connection.stop()
    }

    @Test func aSpaceWithoutCompanionsLoadsEmpty() async {
        let (store, connection, following) = await follow(TestHost())

        #expect(store.summaries.isEmpty)
        following.cancel()
        await connection.stop()
    }

    func pushState(
        _ state: String, of conversationId: String, to host: TestHost, prompt: String? = nil,
        working: [Companion.ID] = []
    ) {
        let observed = FixtureHost.observedJSON(state, prompt: prompt, working: working)
        host.push(
            event: "conversation://state-changed",
            payload: #"{"conversationId":"\#(conversationId)","spaceId":"s-1",\#(observed)}"#)
    }

    nonisolated static let question = "Which format should the release notes take?"

    @Test func aRowWaitingOnYouShowsTheQuestionUntilItIsAnswered() async {
        let host = host
        let (store, connection, following) = await follow(host)
        let row = { store.summaries.first { $0.id == "juniper" } }

        pushState("needs_you", of: "chat-juniper", to: host, prompt: Self.question)
        await waitUntil { row()?.needsYou == true }
        #expect(row()?.preview == Self.question)

        pushState("working", of: "chat-juniper", to: host, working: [juniper.id])
        await waitUntil { row()?.isWorking == true }
        #expect(row()?.preview == "Juniper is working…")

        pushState("idle", of: "chat-juniper", to: host)
        await waitUntil { row()?.state == .idle }
        #expect(row()?.preview == "The release notes are drafted.")
        #expect(row()?.timeLabel != "Now")
        following.cancel()
        await connection.stop()
    }

    @Test func aQuestionWithoutTextKeepsTheLastMessage() async {
        let host = host
        let (store, connection, following) = await follow(host)
        let row = { store.summaries.first { $0.id == "juniper" } }

        pushState("needs_you", of: "chat-juniper", to: host, prompt: "")
        await waitUntil { row()?.needsYou == true }

        #expect(row()?.preview == "The release notes are drafted.")
        following.cancel()
        await connection.stop()
    }

    @Test(arguments: [
        (["juniper"], "Juniper is working…"),
        (["juniper", "atlas"], "Juniper and Atlas are working…"),
        (["juniper", "atlas", "pico"], "Juniper and 2 others are working…"),
        (["ghost", "atlas"], "Atlas is working…"),
        (["ghost"], "working…"),
        ([], "working…"),
    ])
    func aWorkingGroupNamesItsCompanionsAndSkipsAnUnknownOne(ids: [String], line: String) async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)
        let row = { store.summaries.first { $0.id == "group-release" } }

        pushState("working", of: "group-release", to: host, working: ids)
        await waitUntil { row()?.isWorking == true }

        #expect(row()?.preview == line)
        following.cancel()
        await connection.stop()
    }

    @Test func theMainConversationShowsTheStateItIsReadWith() async {
        let host = TestHost(companions: [juniper, atlas, pico]) { call in
            guard call.command == "conversation_main_chat",
                let botId = try? call.args(as: TestHost.BotArgs.self).botId
            else { return nil }
            let observed =
                switch botId {
                case "juniper":
                    FixtureHost.observedJSON("needs_you", prompt: Self.question, working: [])
                case "atlas": FixtureHost.observedJSON("working", prompt: nil, working: ["atlas"])
                default: FixtureHost.observedJSON("idle", prompt: nil, working: [])
                }
            return TestHost.ok(
                call, #"{"id":"chat-\#(botId)","createdAt":0,"updatedAt":0,\#(observed)}"#)
        }
        let (store, connection, following) = await follow(host)
        let row = { (id: String) in store.summaries.first { $0.id == id } }

        #expect(row("juniper")?.needsYou == true)
        #expect(row("juniper")?.preview == Self.question)
        #expect(row("atlas")?.preview == "Atlas is working…")
        #expect(row("pico")?.state == .idle)
        following.cancel()
        await connection.stop()
    }

    @Test func aPageRowShowsItsQuestionAndItsWorkingCompanions() async {
        let release = FixtureHost.Group(
            id: "group-release", title: "Release crew", members: [juniper, atlas], createdAt: 0)
        let calm = FixtureHost.Group(
            id: "group-calm", title: "Calm", members: [pico], createdAt: 0)
        let host = TestHost(companions: [juniper, atlas, pico], groups: [release, calm]) { call in
            guard call.command == "conversation_page" else { return nil }
            var asking = TestHost.pageRow(release, last: nil)
            asking.state = "needs_you"
            asking.prompt = Self.question
            var working = TestHost.pageRow(calm, last: nil)
            working.state = "working"
            working.working = [pico.id]
            let page = FixtureHost.conversationPage([asking, working], cursor: nil, limit: 30)
            return TestHost.ok(call, page)
        }
        let (store, connection, following) = await follow(host)
        let row = { (id: String) in store.summaries.first { $0.id == id } }

        #expect(row("group-release")?.preview == Self.question)
        #expect(row("group-calm")?.preview == "Pico is working…")
        following.cancel()
        await connection.stop()
    }

    @Test func theHostStateMovesItsRowLive() async {
        let host = host
        let (store, connection, following) = await follow(host)
        let row = { store.summaries.first { $0.id == "juniper" } }
        #expect(store.summaries.allSatisfy { $0.state == .idle })

        pushState("working", of: "chat-juniper", to: host)
        await waitUntil { row()?.isWorking == true }
        #expect(row()?.preview == "working…")
        #expect(row()?.timeLabel == "Now")

        pushState("needs_you", of: "chat-juniper", to: host)
        await waitUntil { row()?.needsYou == true }
        #expect(row()?.isWorking == false)
        #expect(row()?.preview == "The release notes are drafted.")
        #expect(row()?.timeLabel == "Now")

        pushState("idle", of: "chat-juniper", to: host)
        await waitUntil { row()?.state == .idle }
        #expect(row()?.preview == "The release notes are drafted.")
        #expect(row()?.timeLabel != "Now")
        #expect(store.summaries.allSatisfy { $0.state == .idle })
        following.cancel()
        await connection.stop()
    }

    @Test func anAgentEventAloneLeavesTheRowAsTheHostLastSaidIt() async {
        let host = host
        let (store, connection, following) = await follow(host)

        host.pushAgent("chat-pico", #"{"type":"turnChanged","state":"running"}"#)
        host.pushAgent("chat-pico", Self.format)
        host.pushAgent(
            "chat-juniper",
            #"{"type":"messageCompleted","message":{"id":"j2","role":"assistant","text":"Done.","timestamp":4000}}"#
        )
        await waitUntil { store.summaries.first { $0.id == "juniper" }?.preview == "Done." }

        #expect(store.summaries.allSatisfy { $0.state == .idle })
        following.cancel()
        await connection.stop()
    }

    nonisolated static let format =
        #"{"type":"questionRequested","request":{"id":"q1","questions":[{"header":"Format","question":"Which format should the release notes take?","multiSelect":false,"options":[{"label":"Summary","description":null,"preview":null},{"label":"Full changelog","description":null,"preview":null}]}]}}"#

    @Test func eachPageRowReadsTheStateTheHostComputed() async throws {
        let release = FixtureHost.Group(
            id: "group-release", title: "Release crew", members: [juniper, atlas], createdAt: 0)
        let calm = FixtureHost.Group(
            id: "group-calm", title: "Calm", members: [pico], createdAt: 0)
        let odd = FixtureHost.Group(
            id: "group-odd", title: "Odd", members: [pico], createdAt: 0)
        let host = TestHost(companions: [juniper], groups: [release, calm, odd]) { call in
            guard call.command == "conversation_page" else { return nil }
            var asking = TestHost.pageRow(release, last: nil)
            asking.state = "needs_you"
            var working = TestHost.pageRow(calm, last: nil)
            working.state = "working"
            var unknown = TestHost.pageRow(odd, last: nil)
            unknown.state = "dreaming"
            let page = FixtureHost.conversationPage(
                [asking, working, unknown], cursor: nil, limit: 30)
            return TestHost.ok(call, page)
        }
        let (store, connection, following) = await follow(host)
        let row = { (id: String) in store.summaries.first { $0.id == id } }

        #expect(row("group-release")?.needsYou == true)
        #expect(row("group-release")?.timeLabel == "Now")
        #expect(row("group-calm")?.isWorking == true)
        #expect(row("group-calm")?.preview == "working…")
        #expect(row("group-odd")?.state == .idle)
        following.cancel()
        await connection.stop()
    }

    @Test func aStoredMessageBecomesThePreviewAndMovesItsCompanionUp() async {
        let host = host
        let (store, connection, following) = await follow(host)

        host.push(
            event: "conversation://message-stored",
            payload: TestHost.message(
                "p1", in: "chat-pico", seq: 1, isYours: true, "Ship it.", at: 9_000))
        await waitUntil { store.summaries.first?.id == "pico" }

        #expect(store.summaries[0].lastMessage?.line == "You: Ship it.")
        following.cancel()
        await connection.stop()
    }

    @Test func aCompletedReplyBecomesThePreview() async {
        let host = host
        let (store, connection, following) = await follow(host)

        host.pushAgent(
            "chat-juniper",
            #"{"type":"messageCompleted","message":{"id":"j2","role":"assistant","text":"Done.","completion":"complete","timestamp":9000}}"#
        )
        await waitUntil { store.summaries.first?.lastMessage?.text == "Done." }

        #expect(store.summaries[0].id == "juniper")
        following.cancel()
        await connection.stop()
    }

    @Test func theListStaysWhenTheHostGoesOffline() async {
        let host = host
        let (store, connection, following) = await follow(host)
        let updates = await connection.updates()

        host.socket.push(.close(RelayClosure.hostOffline))
        for await update in updates {
            if case .state(.hostOffline) = update { break }
        }

        #expect(store.phase == .loaded)
        #expect(store.summaries.count == 3)
        following.cancel()
        await connection.stop()
    }

    func start(_ host: TestHost) async -> (ConversationsStore, RelayConnection, Task<Void, Never>) {
        let connection = makeConnection()
        let store = ConversationsStore()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        return (store, connection, following)
    }

    @Test func aRefusedListFailsInsteadOfLoadingForever() async throws {
        let host = TestHost(holding: ["conversation_bots"])
        let (store, connection, following) = await start(host)

        let call = try #require(await host.nextCall("conversation_bots"))
        host.reply(TestHost.refused(call, status: 500, TestHost.unavailable))
        await waitUntil { store.phase == .failed }

        #expect(store.summaries.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func aCompanionWhoseConversationIsRefusedKeepsTheOtherRows() async throws {
        let host = TestHost(
            companions: [juniper, atlas],
            messages: [
                "chat-atlas": [
                    TestHost.message(
                        "a1", in: "chat-atlas", seq: 1, isYours: false, "Split in two.", at: 3_000)
                ]
            ]
        ) { call in
            guard call.command == "conversation_main_chat",
                (try? call.args(as: TestHost.BotArgs.self))?.botId == "juniper"
            else { return nil }
            return TestHost.refused(
                call, status: 403, #""this command reaches outside the shared space""#)
        }
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.map(\.subject.title) == ["Atlas", "Juniper"])
        #expect(store.summaries[0].preview == "Split in two.")
        #expect(store.summaries[1].conversationId == nil)
        #expect(store.summaries[1].preview == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aFailedRereadKeepsTheList() async {
        let reads = ReadCount()
        let host = TestHost(companions: [juniper, atlas, pico]) { call in
            guard call.command == "conversation_bots", reads.next() > 1 else { return nil }
            return TestHost.refused(call, status: 500, TestHost.unavailable)
        }
        let (store, connection, following) = await follow(host)

        await store.refresh()

        #expect(store.phase == .loaded)
        #expect(store.summaries.count == 3)
        following.cancel()
        await connection.stop()
    }

    @Test func aLoadCutByStoppingTheConnectionIsNotAFailure() async throws {
        let host = TestHost(companions: [juniper], holding: ["conversation_bots"])
        let (store, connection, following) = await start(host)
        _ = try #require(await host.nextCall("conversation_bots"))
        let cut = store.reload()
        _ = try #require(await host.nextCall("conversation_bots"))
        let reconnection = makeConnection()
        let followingAgain = Task { await store.follow(reconnection) }
        while await reconnection.subscriberCount == 0 {
            await Task.yield()
        }

        await connection.stop()
        await cut?.value

        #expect(store.phase == .loading)
        following.cancel()
        followingAgain.cancel()
        await reconnection.stop()
    }

    @Test func aFailureThenANewConnectionToTheSameInstanceLoadsOnceOnline() async throws {
        let host = host
        let refusing = TestHost(companions: [juniper], holding: ["conversation_bots"])
        let (store, connection, following) = await start(refusing)
        let refused = try #require(await refusing.nextCall("conversation_bots"))
        refusing.reply(TestHost.refused(refused, status: 500, TestHost.unavailable))
        await waitUntil { store.phase == .failed }
        following.cancel()
        await connection.stop()

        let reconnection = makeConnection()
        let followingAgain = Task { await store.follow(reconnection) }
        await reconnection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.phase == .loaded }

        #expect(store.summaries.map(\.subject.title) == ["Atlas", "Juniper", "Pico"])
        followingAgain.cancel()
        await reconnection.stop()
    }

    func failWhileOnline(through clock: TestRelayClock) async throws -> (
        ConversationsStore, RelayConnection, Task<Void, Never>
    ) {
        let refusing = TestHost(companions: [juniper], holding: ["conversation_bots"])
        let connection = makeConnection()
        let store = ConversationsStore(clock: clock)
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(refusing.socket)
        let refused = try #require(await refusing.nextCall("conversation_bots"))
        refusing.reply(TestHost.refused(refused, status: 500, TestHost.unavailable))
        await waitUntil { store.phase == .failed }
        refusing.socket.push(.close(RelayClosure.hostOffline))
        await waitUntil { !store.isOnline }
        return (store, connection, following)
    }

    @Test func tryingAgainWhileNotConnectedWaitsThenLoadsOnceOnline() async throws {
        let host = host
        let (store, connection, following) = try await failWhileOnline(through: TestRelayClock())

        let retrying = store.reload()
        #expect(store.phase == .loading)
        await clock.wakeNextSleep(of: Backoff.first)
        await transport.nextOpening().accept(host.socket)
        await retrying?.value
        await waitUntil { store.phase == .loaded }

        #expect(store.summaries.map(\.subject.title) == ["Atlas", "Juniper", "Pico"])
        following.cancel()
        await connection.stop()
    }

    @Test func tryingAgainFailsAgainWhenTheConnectionStaysOffline() async throws {
        let storeClock = TestRelayClock()
        let (store, connection, following) = try await failWhileOnline(through: storeClock)

        let retrying = store.reload()
        #expect(store.phase == .loading)
        await storeClock.wakeNextSleep(of: ConversationsStore.onlineDeadline)
        await retrying?.value

        #expect(store.phase == .failed)
        following.cancel()
        await connection.stop()
    }

    @Test func tryingAgainAfterAFailureLoadsTheList() async throws {
        let host = TestHost(companions: [juniper], holding: ["conversation_bots"])
        let (store, connection, following) = await start(host)
        let refused = try #require(await host.nextCall("conversation_bots"))
        host.reply(TestHost.refused(refused, status: 502, #""the host could not run the call""#))
        await waitUntil { store.phase == .failed }

        let retrying = store.reload()
        #expect(store.phase == .loading)
        let call = try #require(await host.nextCall("conversation_bots"))
        host.reply(TestHost.ok(call, #"[{"id":"juniper","name":"Juniper"}]"#))
        await retrying?.value

        #expect(store.phase == .loaded)
        #expect(store.summaries.map(\.subject.title) == ["Juniper"])
        following.cancel()
        await connection.stop()
    }

    @Test func pullingToRefreshReadsTheListAgain() async throws {
        let host = host
        let (store, connection, following) = await follow(host)

        await store.refresh()

        #expect(store.phase == .loaded)
        #expect(store.summaries.count == 3)
        following.cancel()
        await connection.stop()
    }

    @Test func eachRowCarriesItsTimeLabelAndNowWhileWorking() async {
        let host = host
        let (store, connection, following) = await follow(host)
        #expect(store.summaries.allSatisfy { $0.timeLabel != nil || $0.lastMessage == nil })

        pushState("working", of: "chat-pico", to: host)
        await waitUntil { store.summaries.first { $0.id == "pico" }?.isWorking == true }

        #expect(store.summaries.first { $0.id == "pico" }?.timeLabel == "Now")
        #expect(store.summaries.first { $0.id == "pico" }?.preview == "working…")
        following.cancel()
        await connection.stop()
    }

    var releaseCrew: FixtureHost.Group {
        FixtureHost.Group(
            id: "group-release", title: "Release crew", members: [juniper, atlas],
            createdAt: 1_000)
    }

    var designReview: FixtureHost.Group {
        FixtureHost.Group(
            id: "group-design", title: "", members: [pico, juniper, atlas], createdAt: 3_000)
    }

    var hostWithGroups: TestHost {
        TestHost(
            companions: [juniper, atlas, pico], groups: [releaseCrew, designReview],
            messages: [
                "chat-juniper": [
                    TestHost.message(
                        "j1", in: "chat-juniper", seq: 1, isYours: false,
                        "The release notes are drafted.", at: 2_000)
                ],
                "chat-atlas": [
                    TestHost.message(
                        "a1", in: "chat-atlas", seq: 1, isYours: true,
                        "Can you split the onboarding ticket in two?", at: 3_000)
                ],
                "group-release": [
                    TestHost.message(
                        "r1", in: "group-release", seq: 1, isYours: false,
                        "Tagging 0.42 next.", at: 2_500, by: juniper.id)
                ],
            ])
    }

    @Test func listsGroupsBesideCompanionsMostRecentActivityFirst() async {
        let (store, connection, following) = await follow(hostWithGroups)

        #expect(
            store.summaries.map(\.subject.title) == [
                "Pico, Juniper, Atlas", "Atlas", "Release crew", "Juniper", "Pico",
            ])
        #expect(
            store.summaries.map(\.conversationId) == [
                "group-design", "chat-atlas", "group-release", "chat-juniper", "chat-pico",
            ])
        #expect(store.summaries[2].preview == "Juniper: Tagging 0.42 next.")
        #expect(store.summaries[3].preview == "The release notes are drafted.")
        #expect(store.summaries[0].preview == nil)
        #expect(store.summaries[0].timeLabel == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aMainChatNeverShowsUpTwice() async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)

        let mainChat = FixtureHost.Group(
            id: "chat-juniper", title: "Renamed", members: [juniper], createdAt: 0)
        host.push(
            event: "conversation://updated",
            payload: #"{"spaceId":"s-1","conversation":\#(mainChat.json)}"#)
        host.push(
            event: "conversation://message-stored",
            payload: TestHost.message(
                "p1", in: "chat-pico", seq: 1, isYours: true, "Ship it.", at: 9_000))
        await waitUntil { store.summaries.first?.id == "pico" }

        let conversationIds = store.summaries.compactMap(\.conversationId)
        #expect(conversationIds.count == Set(conversationIds).count)
        #expect(store.summaries.count == 5)
        #expect(store.summaries.first { $0.id == "juniper" }?.subject.title == "Juniper")
        following.cancel()
        await connection.stop()
    }

    @Test func aGroupCreatedRenamedThenDeletedOnTheMacFollowsInTheList() async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)
        let launch = FixtureHost.Group(
            id: "group-launch", title: "Launch plan", members: [juniper, pico],
            createdAt: 10_000)

        host.push(
            event: "conversation://created",
            payload: #"{"spaceId":"s-1","conversation":\#(launch.json)}"#)
        await waitUntil { store.summaries.first?.id == "group-launch" }
        #expect(store.summaries.first?.subject.title == "Launch plan")

        host.push(
            event: "conversation://updated",
            payload:
                #"{"spaceId":"s-1","conversation":\#(launch.renamed("Launch checklist").json)}"#
        )
        await waitUntil { store.summaries.first?.subject.title == "Launch checklist" }
        #expect(store.summaries.count == 6)

        host.push(
            event: "conversation://deleted",
            payload: #"{"spaceId":"s-1","conversationId":"group-launch"}"#)
        await waitUntil { store.summaries.count == 5 }

        #expect(!store.summaries.contains { $0.id == "group-launch" })
        following.cancel()
        await connection.stop()
    }

    @Test func anIconAndColourChangedOnTheMacRepaintTheGroupRow() async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)
        let group = { (id: String) -> GroupConversation? in
            guard case .group(let group) = store.summaries.first(where: { $0.id == id })?.subject
            else { return nil }
            return group
        }
        #expect(group("group-release")?.icon == .messageSquare)
        #expect(group("group-release")?.color == nil)

        var release = releaseCrew
        release.icon = "Rocket"
        release.color = .orange
        host.push(
            event: "conversation://updated",
            payload: #"{"spaceId":"s-1","conversation":\#(release.json)}"#)
        await waitUntil { group("group-release")?.icon == .rocket }
        #expect(group("group-release")?.color == .orange)

        release.icon = nil
        release.color = nil
        host.push(
            event: "conversation://updated",
            payload: #"{"spaceId":"s-1","conversation":\#(release.json)}"#)
        await waitUntil { group("group-release")?.icon == .messageSquare }

        #expect(group("group-release")?.color == nil)
        #expect(store.summaries.count == 5)
        following.cancel()
        await connection.stop()
    }

    @Test func aGroupAtWorkReadsWorkingWithoutNamingACompanion() async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)

        pushState("working", of: "group-release", to: host)
        await waitUntil { store.summaries.first { $0.id == "group-release" }?.isWorking == true }

        let release = store.summaries.first { $0.id == "group-release" }
        #expect(release?.preview == "working…")
        #expect(release?.timeLabel == "Now")
        following.cancel()
        await connection.stop()
    }

    func release(in store: ConversationsStore) -> ConversationSummary? {
        store.summaries.first { $0.id == "group-release" }
    }

    func atlasSays(_ content: String, to host: TestHost, in store: ConversationsStore) async {
        host.push(
            event: "conversation://message-stored",
            payload: TestHost.message(
                "r2", in: "group-release", seq: 2, isYours: false, content, at: 9_000,
                by: atlas.id))
        await waitUntil { release(in: store)?.lastMessage?.text == content }
    }

    @Test(arguments: [
        ("<@juniper> can you look", "Atlas: @Juniper can you look"),
        ("<@juniper> then <@atlas>, ship it", "Atlas: @Juniper then @Atlas, ship it"),
        ("<@otto> left", "Atlas: @Unknown companion left"),
    ])
    func aMentionInThePreviewReadsAsInTheThread(content: String, preview: String) async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)

        await atlasSays(content, to: host, in: store)

        let summary = release(in: store)
        #expect(summary?.preview == preview)
        let thread = ThreadMessage(
            id: "r2", writer: .companion(atlas.id), text: content, sentAt: .now,
            authors: summary?.subject.namedAuthors ?? [])
        #expect(summary?.preview == "Atlas: \(String(thread.rendered.characters))")
        following.cancel()
        await connection.stop()
    }

    @Test func aCompanionRenamedOnTheMacRenamesItsMentionInThePreview() async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)
        await atlasSays("<@juniper> can you look", to: host, in: store)

        let renamed = FixtureHost.Group(
            id: releaseCrew.id, title: releaseCrew.title,
            members: [Companion(id: juniper.id, name: "Juno"), atlas],
            createdAt: releaseCrew.createdAt)
        host.push(
            event: "conversation://updated",
            payload: #"{"spaceId":"s-1","conversation":\#(renamed.json)}"#)
        await waitUntil { release(in: store)?.preview == "Atlas: @Juno can you look" }

        #expect(release(in: store)?.preview == "Atlas: @Juno can you look")
        following.cancel()
        await connection.stop()
    }

    var created: FixtureHost.Group {
        FixtureHost.Group(id: "group-new", title: "", members: [juniper, pico], createdAt: 10_000)
    }

    @Test func thePickerListsTheCompanionsOfTheSpaceInTheHostsOrder() async {
        let host = host
        let (store, connection, following) = await follow(host)

        #expect(store.companions.map(\.name) == ["Juniper", "Atlas", "Pico"])
        following.cancel()
        await connection.stop()
    }

    @Test func creatingAGroupAsksTheHostThenListsAndOpensIt() async throws {
        let host = TestHost(companions: [juniper, atlas, pico], holding: ["conversation_create"])
        let (store, connection, following) = await follow(host)
        store.pickCompanions()

        let creating = try #require(store.createGroup(with: ["juniper", "pico"]))
        let call = try #require(await host.nextCall("conversation_create"))
        #expect(store.creation == .creating)
        let args = try call.args(as: CreateArgs.self)
        #expect(args.spaceId == "s-1")
        #expect(args.botIds == ["juniper", "pico"])
        #expect(args.title == "")
        #expect(call.text.contains(#""sectionId":null"#))
        host.push(
            event: "conversation://created",
            payload: #"{"spaceId":"s-1","conversation":\#(created.json)}"#)
        await waitUntil { store.summaries.contains { $0.id == "group-new" } }
        host.reply(TestHost.ok(call, created.json))
        await creating.value

        #expect(store.summaries.filter { $0.id == "group-new" }.count == 1)
        #expect(store.summaries.first?.subject.title == "Juniper, Pico")
        #expect(store.opened?.id == "group-new")
        #expect(store.opened?.members.map(\.id) == ["juniper", "pico"])
        #expect(!store.isPickingCompanions)
        #expect(store.creation == .idle)
        following.cancel()
        await connection.stop()
    }

    @Test func aRefusedCreationFailsAndKeepsThePickerOpen() async throws {
        let host = TestHost(companions: [juniper, atlas]) { call in
            call.command == "conversation_create"
                ? TestHost.refused(call, status: 500, TestHost.unavailable) : nil
        }
        let (store, connection, following) = await follow(host)
        store.pickCompanions()

        await store.createGroup(with: ["atlas"])?.value

        #expect(store.creation == .failed)
        #expect(store.isPickingCompanions)
        #expect(store.opened == nil)
        #expect(!store.summaries.contains { $0.subject.isGroup("group-new") })
        store.pickCompanions()
        #expect(store.creation == .idle)
        following.cancel()
        await connection.stop()
    }

    @Test func cancellingWhileCreatingIsNotAFailureAndOpensNothing() async throws {
        let host = TestHost(companions: [juniper, atlas, pico], holding: ["conversation_create"])
        let (store, connection, following) = await follow(host)
        store.pickCompanions()

        let creating = try #require(store.createGroup(with: ["juniper", "pico"]))
        let call = try #require(await host.nextCall("conversation_create"))
        store.stopPicking()
        host.reply(TestHost.ok(call, created.json))
        await creating.value

        #expect(store.creation == .idle)
        #expect(!store.isPickingCompanions)
        #expect(store.opened == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func nothingIsCreatedWithoutACompanion() async {
        let (store, connection, following) = await follow(host)

        #expect(store.createGroup(with: []) == nil)
        #expect(store.creation == .idle)
        following.cancel()
        await connection.stop()
    }

    struct SpaceArgs: Decodable {
        let spaceId: String
    }

    struct CreateArgs: Decodable {
        let spaceId: String
        let sectionId: String?
        let title: String
        let botIds: [String]
    }
}

private final class ReadCount: Sendable {
    private let count = Mutex(0)

    func next() -> Int {
        count.withLock { count in
            count += 1
            return count
        }
    }
}
