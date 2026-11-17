import Foundation
import Observation
import Synchronization
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RelayResyncTests {
    nonisolated static let refusal = "the relay refused the host's answer: Device socket is full"
    nonisolated static let unanswered = #"{"id":-1,"status":200,"body":null}"#

    let transport = TestRelayTransport()
    let clock = TestRelayClock()

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

    func connect(_ connection: RelayConnection, to host: TestHost) async {
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        for await update in updates {
            if case .state(.online) = update {
                return
            }
        }
    }

    static func resync(_ answered: String) -> String {
        #"{"resync":{"answered":[\#(answered)]}}"#
    }

    static func message(_ seq: Int) -> String {
        TestHost.message(
            "m\(seq)", in: "chat-juniper", seq: seq, isYours: seq.isMultiple(of: 2),
            "Message \(seq)", at: 1_791_000_000_000 + seq)
    }

    @Test func aResyncEndsAtOnceOnlyTheWaitingCallsItNamesWithTheRelaysRefusal() async throws {
        let host = TestHost()
        let connection = makeConnection()
        await connect(connection, to: host)

        async let sent = connection.call("conversation_send_turn", args: ["text": "Hi"])
        let sentCall = try #require(await host.nextCall("conversation_send_turn"))
        async let stopped = connection.call("agent_cancel_turn", args: ["turnId": "t1"])
        let stopCall = try #require(await host.nextCall("agent_cancel_turn"))

        host.reply(#"{"resync":{}}"#)
        host.reply(Self.resync(#"\#(sentCall.id),999,"\#(stopCall.id)""#))
        host.reply(TestHost.ok(sentCall, #""late""#))
        host.reply(Self.resync(#"\#(sentCall.id),999,"\#(stopCall.id)""#))
        host.reply(TestHost.ok(stopCall, #""stopped""#))

        let refused = try await sent
        #expect(refused.status == 413)
        #expect(try refused.body(as: String.self) == Self.refusal)
        let answered = try await stopped
        #expect(answered.status == 200)
        #expect(try answered.body(as: String.self) == "stopped")
        await connection.stop()
    }

    final class CallCount: Sendable {
        private let count = Mutex(0)

        var value: Int {
            count.withLock { $0 }
        }

        func next() -> Int {
            count.withLock { count in
                count += 1
                return count
            }
        }
    }

    nonisolated static func counting(_ command: String, in calls: CallCount, first: String?)
        -> TestHost.Answer
    {
        { call in
            guard call.command == command else { return nil }
            guard calls.next() == 1 else { return unanswered }
            return first.map { TestHost.ok(call, $0) }
        }
    }

    func followThread(_ host: TestHost) async -> (ThreadStore, RelayConnection, Task<Void, Never>) {
        let store = ThreadStore(
            subject: .companion(Companion(id: "juniper", name: "Juniper")), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded && store.entries.count == 2 }
        return (store, connection, following)
    }

    func threadPage(_ seqs: ClosedRange<Int>) -> String {
        TestHost.messagePage("chat-juniper", seqs.map(Self.message), hasMore: false)
    }

    @Test func aSecondResyncDuringAThreadRereadGivesOneMoreAndTheMissedMessagesLandOnceInOrder()
        async throws
    {
        let pageCalls = CallCount()
        let host = TestHost(
            messages: ["chat-juniper": [Self.message(1), Self.message(2)]],
            answer: Self.counting("conversation_message_page", in: pageCalls, first: nil))
        let (store, connection, following) = await followThread(host)

        host.reply(Self.resync(""))
        host.reply(Self.resync(""))
        host.push(event: "conversation://message-stored", payload: Self.message(5))
        await waitUntil { store.entries.map(\.id) == ["m1", "m2", "m5"] }
        _ = await host.nextCall("conversation_message_page")
        let reread = try #require(await host.nextCall("conversation_message_page"))
        host.reply(TestHost.ok(reread, threadPage(1...5)))
        await waitUntil { store.entries.count == 5 }
        let trailing = try #require(await host.nextCall("conversation_message_page"))
        host.reply(TestHost.ok(trailing, threadPage(1...6)))
        await waitUntil { store.entries.count == 6 }

        #expect(store.entries.map(\.id) == ["m1", "m2", "m3", "m4", "m5", "m6"])
        #expect(store.entries.map(\.text) == (1...6).map { "Message \($0)" })
        #expect(pageCalls.value == 3)
        following.cancel()
        await connection.stop()
    }

    @Test func aThreadRereadWhoseOwnAnswerTheRelayRefusedIsFollowedByOneMore() async throws {
        let pageCalls = CallCount()
        let host = TestHost(
            messages: ["chat-juniper": [Self.message(1), Self.message(2)]],
            answer: Self.counting("conversation_message_page", in: pageCalls, first: nil))
        let (store, connection, following) = await followThread(host)

        host.reply(Self.resync(""))
        _ = await host.nextCall("conversation_message_page")
        let refused = try #require(await host.nextCall("conversation_message_page"))
        host.reply(Self.resync("\(refused.id)"))
        let next = try #require(await host.nextCall("conversation_message_page"))
        host.reply(TestHost.ok(next, threadPage(1...4)))
        await waitUntil { store.phase == .loaded && store.entries.count == 4 }

        #expect(store.entries.map(\.id) == ["m1", "m2", "m3", "m4"])
        #expect(pageCalls.value == 3)
        following.cancel()
        await connection.stop()
    }

    @Test func theConversationsListHoldsTheGroupsItMissedOnceAfterResyncs() async throws {
        let juniper = Companion(id: "juniper", name: "Juniper")
        let release = FixtureHost.Group(
            id: "group-release", title: "Release crew", members: [juniper], createdAt: 1)
        let renamed = FixtureHost.Group(
            id: "group-release", title: "Release 0.42", members: [juniper], createdAt: 1)
        let launch = FixtureHost.Group(
            id: "group-launch", title: "Launch plan", members: [juniper], createdAt: 2)
        let hotfix = FixtureHost.Group(
            id: "group-hotfix", title: "Hotfix", members: [juniper], createdAt: 3)
        func page(_ groups: [FixtureHost.Group]) -> String {
            FixtureHost.conversationPage(
                groups.map { TestHost.pageRow($0, last: nil) }, cursor: nil, limit: 30)
        }
        let pageCalls = CallCount()
        let host = TestHost(
            companions: [juniper], groups: [release],
            answer: Self.counting("conversation_page", in: pageCalls, first: nil))
        let store = ConversationsStore()
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded && store.summaries.count == 2 }

        host.reply(Self.resync(""))
        host.reply(Self.resync(""))
        host.push(
            event: "conversation://updated",
            payload: #"{"spaceId":"s-1","conversation":\#(renamed.json)}"#)
        await waitUntil { store.summaries.contains { $0.subject.title == "Release 0.42" } }
        _ = await host.nextCall("conversation_page")
        let reread = try #require(await host.nextCall("conversation_page"))
        host.reply(TestHost.ok(reread, page([renamed, launch])))
        await waitUntil { store.summaries.contains { $0.subject.title == "Launch plan" } }
        let trailing = try #require(await host.nextCall("conversation_page"))
        host.reply(TestHost.ok(trailing, page([renamed, launch, hotfix])))
        await waitUntil { store.summaries.contains { $0.subject.title == "Hotfix" } }

        #expect(
            store.summaries.map(\.subject.title).sorted() == [
                "Hotfix", "Juniper", "Launch plan", "Release 0.42",
            ])
        #expect(pageCalls.value == 3)
        following.cancel()
        await connection.stop()
    }

    @Test func threeResyncsDuringAMissionRereadGiveOneTrailingRereadAndTheMissedMessagesOnce()
        async throws
    {
        let pageCalls = CallCount()
        func page(_ seqs: ClosedRange<Int>) -> String {
            TestHost.messagePage("thread-mission-1", seqs.map(message), hasMore: false)
        }
        func message(_ seq: Int) -> String {
            MissionTesting.message(
                id: "m\(seq)", seq: seq, role: seq.isMultiple(of: 2) ? "assistant" : "user",
                content: "Message \(seq)", createdAt: seq,
                botId: seq.isMultiple(of: 2) ? "bot-1" : nil)
        }
        let host = TestHost(
            answer: Self.counting("conversation_message_page", in: pageCalls, first: page(1...2)))
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.hasLoaded && store.transcript.entries.count == 2 }

        for _ in 1...4 {
            host.reply(Self.resync(""))
        }
        host.push(event: "conversation://message-stored", payload: message(5))
        await waitUntil { store.transcript.entries.count == 3 }
        _ = await host.nextCall("conversation_message_page")
        let reread = try #require(await host.nextCall("conversation_message_page"))
        host.reply(TestHost.ok(reread, page(1...5)))
        await waitUntil { store.transcript.entries.count == 5 }
        let trailing = try #require(await host.nextCall("conversation_message_page"))
        host.reply(TestHost.ok(trailing, page(1...6)))
        await waitUntil { store.transcript.entries.count == 6 }

        #expect(store.transcript.entries.map(\.id) == ["m1", "m2", "m3", "m4", "m5", "m6"])
        #expect(pageCalls.value == 3)
        following.cancel()
        await connection.stop()
    }
}
