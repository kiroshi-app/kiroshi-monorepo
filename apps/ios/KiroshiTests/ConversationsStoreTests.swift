import Foundation
import Observation
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

    @Test func aRunningTurnMarksItsCompanionWorkingUntilItEnds() async {
        let host = host
        let (store, connection, following) = await follow(host)

        host.pushAgent("chat-pico", #"{"type":"turnChanged","state":"running"}"#)
        await waitUntil { store.summaries.first { $0.id == "pico" }?.isWorking == true }
        host.pushAgent(
            "chat-pico", #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#)
        await waitUntil { store.summaries.first { $0.id == "pico" }?.isWorking == false }

        #expect(store.summaries.allSatisfy { !$0.isWorking })
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

    @Test func aCompanionWhoseConversationIsRefusedFailsTheList() async throws {
        let host = TestHost(companions: [juniper], holding: ["conversation_main_chat"])
        let (store, connection, following) = await start(host)

        let call = try #require(await host.nextCall("conversation_main_chat"))
        host.reply(
            TestHost.refused(call, status: 403, #""this command reaches outside the shared space""#)
        )
        await waitUntil { store.phase == .failed }

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

        host.pushAgent("chat-pico", #"{"type":"turnChanged","state":"running"}"#)
        await waitUntil { store.summaries.first { $0.id == "pico" }?.isWorking == true }

        #expect(store.summaries.first { $0.id == "pico" }?.timeLabel == "Now")
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

    @Test func aGroupDeletedWhileItsThreadIsOpenGoesBackToTheList() async throws {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)
        let release = try #require(store.summaries.first { $0.id == "group-release" })
        store.opened = release.subject

        host.push(
            event: "conversation://deleted",
            payload: #"{"spaceId":"s-1","conversationId":"group-design"}"#)
        await waitUntil { store.summaries.count == 4 }
        #expect(store.opened == release.subject)

        host.push(
            event: "conversation://deleted",
            payload: #"{"spaceId":"s-1","conversationId":"group-release"}"#)
        await waitUntil { store.opened == nil }

        #expect(!store.summaries.contains { $0.id == "group-release" })
        following.cancel()
        await connection.stop()
    }

    @Test func aCompanionWorkingInAGroupNamesItInTheRow() async {
        let host = hostWithGroups
        let (store, connection, following) = await follow(host)

        host.push(
            event: "agent://event",
            payload:
                #"{"scope":{"conversationId":"group-release","botId":"atlas","runtimeSessionId":"session-1","epoch":1},"event":{"type":"turnChanged","state":"running"},"turn":null}"#
        )
        await waitUntil { store.summaries.first { $0.id == "group-release" }?.isWorking == true }

        let release = store.summaries.first { $0.id == "group-release" }
        #expect(release?.workingName == "Atlas")
        #expect(release?.workingCompanionIds == ["atlas"])
        #expect(release?.timeLabel == "Now")
        following.cancel()
        await connection.stop()
    }

    struct SpaceArgs: Decodable {
        let spaceId: String
    }
}
