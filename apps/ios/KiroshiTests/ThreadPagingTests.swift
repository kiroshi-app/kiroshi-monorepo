import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ThreadPagingTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let juniper = Companion(id: "juniper", name: "Juniper")
    let work = CompanionWork()

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

    static let history = (1...60).map { seq in
        TestHost.message(
            "m\(seq)", in: "chat-juniper", seq: seq, isYours: seq.isMultiple(of: 2),
            "Note \(seq).", at: 1_790_000_000_000 + seq * 60_000)
    }

    func follow(_ host: TestHost) async -> (ThreadStore, RelayConnection, Task<Void, Never>) {
        let connection = makeConnection()
        let store = ThreadStore(subject: .companion(juniper), work: work)
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.phase == .loaded }
        return (store, connection, following)
    }

    @Test func reachingTheTopReadsThePageBeforeTheOldestMessageHeld() async throws {
        let host = TestHost(messages: ["chat-juniper": Self.history])
        let (store, connection, following) = await follow(host)
        let first = try #require(await host.nextCall("conversation_message_page"))
        #expect(try first.args(as: TestHost.PageArgs.self).beforeSeq == nil)
        #expect(store.entries.first?.id == "m11")
        #expect(store.hasOlder)

        store.loadOlder()
        let older = try #require(await host.nextCall("conversation_message_page"))
        #expect(try older.args(as: TestHost.PageArgs.self).beforeSeq == 11)
        await waitUntil { !store.hasOlder }

        #expect(store.entries.map(\.id) == (1...60).map { "m\($0)" })
        following.cancel()
        await connection.stop()
    }

    @Test func reachingTheTopTwiceAsksOnce() async throws {
        let host = TestHost(messages: ["chat-juniper": Self.history])
        let (store, connection, following) = await follow(host)
        _ = await host.nextCall("conversation_message_page")

        store.loadOlder()
        store.loadOlder()
        _ = await host.nextCall("conversation_message_page")
        await waitUntil { !store.hasOlder }
        store.loadOlder()
        store.reload()

        let next = try #require(await host.nextCall("conversation_message_page"))
        #expect(try next.args(as: TestHost.PageArgs.self).beforeSeq == nil)
        #expect(store.entries.count == 60)
        following.cancel()
        await connection.stop()
    }

    @Test func aThreadThatFitsInOnePageHasNothingOlder() async {
        let host = TestHost(messages: ["chat-juniper": Array(Self.history.prefix(20))])
        let (store, connection, following) = await follow(host)

        #expect(!store.hasOlder)
        #expect(store.entries.count == 20)
        following.cancel()
        await connection.stop()
    }

    @Test func aFailedOlderPageKeepsTheThreadAndCanBeTriedAgain() async throws {
        let host = TestHost(messages: ["chat-juniper": Self.history]) { call in
            guard call.command == "conversation_message_page",
                (try? call.args(as: TestHost.PageArgs.self).beforeSeq) != nil
            else { return nil }
            return TestHost.refused(call, status: 500, TestHost.unavailable)
        }
        let (store, connection, following) = await follow(host)

        store.loadOlder()
        await waitUntil { store.olderFailed }

        #expect(store.entries.count == 50)
        #expect(store.hasOlder)
        following.cancel()
        await connection.stop()
    }

    @Test func reconnectingKeepsTheOlderPagesAlreadyRead() async throws {
        let host = TestHost(messages: ["chat-juniper": Self.history])
        let (store, connection, following) = await follow(host)
        store.loadOlder()
        await waitUntil { !store.hasOlder }

        await store.reload()?.value

        #expect(store.entries.map(\.id) == (1...60).map { "m\($0)" })
        #expect(!store.hasOlder)
        following.cancel()
        await connection.stop()
    }
}

struct ThreadAnchorTests {
    func messages(_ ids: String...) -> [ThreadMessage] {
        ids.map { ThreadMessage(id: $0, writer: .companion(nil), text: $0, sentAt: .now) }
    }

    @Test func anOlderPageKeepsTheMessageBeingRead() {
        let kept = ThreadAnchor.message(
            toKeep: "m20", whenFirstWas: "m11", in: messages("m1", "m10", "m11", "m20"))

        #expect(kept == "m20")
    }

    @Test func aThreadReadAgainFromItsLatestPageKeepsNothing() {
        let kept = ThreadAnchor.message(
            toKeep: "m20", whenFirstWas: "m11", in: messages("m30", "m31"))

        #expect(kept == nil)
    }

    @Test func theFirstPageOrNothingOnScreenKeepsNothing() {
        #expect(
            ThreadAnchor.message(toKeep: "m20", whenFirstWas: nil, in: messages("m11", "m20"))
                == nil)
        #expect(
            ThreadAnchor.message(toKeep: nil, whenFirstWas: "m11", in: messages("m1", "m11"))
                == nil)
    }
}
