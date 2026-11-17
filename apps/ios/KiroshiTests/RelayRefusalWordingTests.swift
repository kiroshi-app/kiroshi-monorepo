import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RelayRefusalWordingTests {
    static let filesTooLarge =
        "Couldn’t send your files, they’re too large. Each can be up to 10 MB, 30 MB together. Remove one and tap Send again."
    static let missionFilesTooLarge =
        "Couldn’t send your files: they’re too large. Remove one and send again."
    static let hostOffline =
        "The host’s computer is offline. You can send again once it’s back."
    static let emptyThread =
        #"{"conversationId":"thread-mission-1","hasMore":false,"arrivals":[],"messages":[]}"#

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

    static func resync(naming id: Int) -> String {
        #"{"resync":{"answered":[\#(id)]}}"#
    }

    static func callId(_ command: String, on socket: ScriptedRelaySocket) async -> Int? {
        for await text in socket.sent {
            guard
                let call = try? JSONSerialization.jsonObject(with: Data(text.utf8))
                    as? [String: Any],
                call["command"] as? String == command
            else { continue }
            return call["id"] as? Int
        }
        return nil
    }

    func followThread(_ host: TestHost) async -> (ThreadStore, RelayConnection, Task<Void, Never>) {
        let store = ThreadStore(
            subject: .companion(Companion(id: "juniper", name: "Juniper")), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.phase == .loaded }
        return (store, connection, following)
    }

    func followMission(on socket: ScriptedRelaySocket) async -> (
        MissionThreadStore, RelayConnection, Task<Void, Never>
    ) {
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.isOnline && store.hasLoaded }
        return (store, connection, following)
    }

    @Test func aConversationSendTheRelayRefusedTheAnswerToReadsAsAFailedSendNotFilesTooLarge()
        async throws
    {
        let host = TestHost()
        let (store, connection, following) = await followThread(host)

        store.draft = "Hello"
        let sending = store.send()
        let call = try #require(await host.nextCall("conversation_send_turn"))
        host.reply(Self.resync(naming: call.id))
        await sending?.value

        #expect(store.sendFailure == .refused)
        #expect(store.problem == "Couldn’t send. Tap Send to try again.")
        following.cancel()
        await connection.stop()
    }

    @Test func aConversationPayloadTheHostFindsTooLargeStillReadsFilesTooLarge() async throws {
        let host = TestHost { call in
            guard call.command == "conversation_send_turn" else { return nil }
            return TestHost.refused(
                call, status: 413, #""the call is larger than the host accepts""#)
        }
        let (store, connection, following) = await followThread(host)

        store.draft = "Hello"
        await store.send()?.value

        #expect(store.sendFailure == .tooLarge)
        #expect(store.problem == Self.filesTooLarge)
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionAnswerTheRelayRefusedTheAnswerToReadsAsAFailedSendNotFilesTooLarge()
        async throws
    {
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1", answers: ["conversation_message_page": Self.emptyThread])
        let (store, connection, following) = await followMission(on: socket)

        store.draft = "Go"
        let sending = store.send()
        let id = try #require(await Self.callId("conversation_send_turn", on: socket))
        socket.push(.frame(Self.resync(naming: id)))
        await sending?.value

        #expect(store.sendProblem == .couldNotSend)
        #expect(store.problem == "Couldn’t send your answer. Send it again.")
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionPayloadTheHostFindsTooLargeStillReadsFilesTooLarge() async throws {
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1", answers: ["conversation_message_page": Self.emptyThread])
        let (store, connection, following) = await followMission(on: socket)

        store.draft = "Go"
        let sending = store.send()
        let id = try #require(await Self.callId("conversation_send_turn", on: socket))
        socket.push(
            .frame(#"{"id":\#(id),"status":413,"body":"the call is larger than the host accepts"}"#)
        )
        await sending?.value

        #expect(store.sendProblem == .tooLarge)
        #expect(store.problem == Self.missionFilesTooLarge)
        following.cancel()
        await connection.stop()
    }

    @Test func aLoadedMissionWhoseSharedSpaceAnswerTheRelayRefusedNeverSaysTheHostIsOffline()
        async throws
    {
        let first = ScriptedRelaySocket(
            sharedSpaceId: "s-1", answers: ["conversation_message_page": Self.emptyThread])
        let (store, connection, following) = await followMission(on: first)

        first.push(.close(1006))
        await clock.wakeNextSleep(of: Backoff.first)
        let refused = ScriptedRelaySocket()
        await transport.nextOpening().accept(refused)
        let id = try #require(await Self.callId("relay_shared_space", on: refused))
        let updates = await connection.updates()
        refused.push(.frame(Self.resync(naming: id)))
        for await update in updates {
            if case .state(.unreachable) = update { break }
        }

        #expect(!store.isOnline)
        #expect(store.problem != Self.hostOffline)
        #expect(store.problem == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionWhoseHostLeftStillSaysTheHostIsOffline() async throws {
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1", answers: ["conversation_message_page": Self.emptyThread])
        let (store, connection, following) = await followMission(on: socket)

        socket.push(.close(RelayClosure.hostOffline))
        await waitUntil { store.problem != nil }

        #expect(store.problem == Self.hostOffline)
        following.cancel()
        await connection.stop()
    }
}
