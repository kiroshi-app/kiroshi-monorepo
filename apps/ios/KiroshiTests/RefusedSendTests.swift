import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RefusedSendTests {
    struct SendArgs: Decodable {
        struct Message: Decodable {
            let id: String
        }

        let message: Message
    }

    struct ResumeArgs: Decodable {
        let token: String
    }

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

    static func stamped(_ event: String, _ payload: String, seq: Int, token: String? = nil)
        -> String
    {
        let replayFor = token.map { #","token":"\#($0)""# } ?? ""
        return
            #"{"event":{"event":"\#(event)","payload":\#(payload)},"epoch":"e-1","seq":\#(seq)\#(replayFor)}"#
    }

    static func stored(_ message: String, seq: Int, token: String? = nil) -> String {
        stamped("conversation://message-stored", message, seq: seq, token: token)
    }

    static func resync(_ call: TestCall) -> String {
        #"{"resync":{"answered":[\#(call.id)]}}"#
    }

    static func yours(_ id: String, _ text: String, seq: Int, in conversationId: String)
        -> String
    {
        TestHost.message(
            id, in: conversationId, seq: seq, isYours: true, text, at: 1_791_000_000_000 + seq)
    }

    func followThread(_ host: TestHost) async -> (ThreadStore, RelayConnection, Task<Void, Never>) {
        let store = ThreadStore(
            subject: .companion(Companion(id: "juniper", name: "Juniper")), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded && store.entries.count == 2 }
        host.reply(Self.stamped("test://replay", "1", seq: 1))
        return (store, connection, following)
    }

    func threadHost() -> TestHost {
        TestHost(messages: [
            "chat-juniper": [
                Self.yours("m1", "Morning", seq: 1, in: "chat-juniper"),
                TestHost.message(
                    "m2", in: "chat-juniper", seq: 2, isYours: false, "Hi", at: 1_791_000_000_002),
            ]
        ])
    }

    func resumed(on host: TestHost) async throws -> (TestCall, String) {
        let call = try #require(await host.nextCall("relay_resume"))
        return (call, try call.args(as: ResumeArgs.self).token)
    }

    static func replayed(_ call: TestCall, token: String, count: Int) -> String {
        TestHost.ok(call, #"{"token":"\#(token)","replayed":\#(count)}"#)
    }

    @Test func aSendWhoseAnswerTheRelayRefusedIsSentOnceTheReplayBringsItsMessage() async throws {
        let host = threadHost()
        let (store, connection, following) = await followThread(host)

        store.draft = "Ship it"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        let id = try sent.args(as: SendArgs.self).message.id
        host.reply(Self.resync(sent))
        let (resume, token) = try await resumed(on: host)
        host.reply(
            Self.stored(Self.yours(id, "Ship it", seq: 3, in: "chat-juniper"), seq: 2, token: token)
        )
        host.reply(Self.replayed(resume, token: token, count: 1))
        await sending?.value
        await waitUntil { store.entries.contains { $0.id == id } }

        #expect(store.entries.map(\.id) == ["m1", "m2", id])
        #expect(store.entries.last?.isYours == true)
        #expect(store.problem == nil)
        #expect(store.sendFailure == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func aSendWhoseMessageArrivedBeforeTheRelayRefusedItsAnswerIsSentOnce() async throws {
        let host = threadHost()
        let (store, connection, following) = await followThread(host)

        store.draft = "Ship it"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        let id = try sent.args(as: SendArgs.self).message.id
        host.reply(Self.stored(Self.yours(id, "Ship it", seq: 3, in: "chat-juniper"), seq: 2))
        await waitUntil { store.entries.contains { $0.id == id } }
        host.reply(Self.resync(sent))
        let (resume, token) = try await resumed(on: host)
        host.reply(Self.replayed(resume, token: token, count: 0))
        await sending?.value

        #expect(store.entries.map(\.id) == ["m1", "m2", id])
        #expect(store.problem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func aSendTheReplayDoesNotBringStaysFailedEvenBesideAnIdenticalMessage() async throws {
        let host = threadHost()
        let (store, connection, following) = await followThread(host)

        store.draft = "Ship it"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        host.reply(Self.resync(sent))
        let (resume, token) = try await resumed(on: host)
        host.reply(
            Self.stored(
                Self.yours("from-the-mac", "Ship it", seq: 3, in: "chat-juniper"), seq: 2,
                token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await sending?.value
        await waitUntil { store.entries.contains { $0.id == "from-the-mac" } }

        #expect(store.entries.map(\.id) == ["m1", "m2", "from-the-mac"])
        #expect(store.sendFailure == .refused)
        #expect(store.problem == "Couldn’t send. Tap Send to try again.")
        #expect(store.draft == "Ship it")
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionAnswerWhoseAnswerTheRelayRefusedIsSentOnceTheReplayBringsIt() async throws {
        let host = TestHost(messages: ["thread-mission-1": []])
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            newId: { "id-1" })
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.hasLoaded && store.isOnline }
        host.reply(Self.stamped("test://replay", "1", seq: 1))

        store.draft = "Go ahead"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        host.reply(Self.resync(sent))
        let (resume, token) = try await resumed(on: host)
        host.reply(
            Self.stored(
                Self.yours("id-1", "Go ahead", seq: 1, in: "thread-mission-1"), seq: 2,
                token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await sending?.value
        await waitUntil { store.transcript.entries.contains { $0.id == "id-1" } }

        #expect(store.transcript.entries.map(\.id) == ["id-1"])
        #expect(store.sendProblem == nil)
        #expect(store.problem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionAnswerTheReplayDoesNotBringStaysFailed() async throws {
        let host = TestHost(messages: ["thread-mission-1": []])
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            newId: { "id-1" })
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.hasLoaded && store.isOnline }
        host.reply(Self.stamped("test://replay", "1", seq: 1))

        store.draft = "Go ahead"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        host.reply(Self.resync(sent))
        let (resume, token) = try await resumed(on: host)
        host.reply(Self.replayed(resume, token: token, count: 0))
        await sending?.value

        #expect(store.transcript.entries.isEmpty)
        #expect(store.sendProblem == .couldNotSend)
        #expect(store.draft == "Go ahead")
        following.cancel()
        await connection.stop()
    }
}
