import Foundation
import Testing

@testable import Kiroshi

@Suite(.timeLimit(.minutes(1)))
struct RelayConnectionTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()

    func makeConnection(baseURL: URL = KiroshiCloud.productionURL) -> RelayConnection {
        RelayConnection(
            baseURL: baseURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock),
            backoff: Backoff(jitter: { $0 }))
    }

    func waitFor(
        _ expected: RelayState, in updates: AsyncStream<RelayUpdate>
    ) async {
        for await update in updates {
            if case .state(let state) = update, state == expected {
                return
            }
        }
    }

    func nextEvent(in updates: AsyncStream<RelayUpdate>) async -> RelayEvent? {
        for await update in updates {
            if case .event(let event) = update {
                return event
            }
        }
        return nil
    }

    func sentCall(_ socket: ScriptedRelaySocket) async throws -> SentCall {
        var iterator = socket.sent.makeAsyncIterator()
        let text = try #require(await iterator.next())
        return try JSONDecoder().decode(SentCall.self, from: Data(text.utf8))
    }

    @Test func opensTheMemberSocketWithTheBearer() async {
        let connection = makeConnection()
        await connection.start()

        let opening = await transport.nextOpening()

        #expect(
            opening.request.url?.absoluteString
                == "wss://api.kiroshi.app/instances/instance-1/relay/member?device=\(FixtureKeys.memberRelayId)"
        )
        #expect(
            opening.request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-bearer")
        await connection.stop()
    }

    @Test func aPlainHTTPBaseOpensAPlainWebSocket() async {
        let connection = makeConnection(baseURL: URL(string: "http://localhost:3000")!)
        await connection.start()

        let opening = await transport.nextOpening()

        #expect(
            opening.request.url?.absoluteString
                == "ws://localhost:3000/instances/instance-1/relay/member?device=\(FixtureKeys.memberRelayId)"
        )
        await connection.stop()
    }

    @Test func goesOnlineOnceTheHostNamesTheSharedSpace() async throws {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket()
        await transport.nextOpening().accept(socket)

        let call = try await sentCall(socket)
        #expect(call.command == "relay_shared_space")
        #expect(call.args == nil)
        socket.push(.frame(#"{"id":\#(call.id),"status":200,"body":{"spaceId":"s-1"}}"#))

        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        await connection.stop()
    }

    @Test(
        arguments: [
            (401, RelayState.signedOut),
            (404, RelayState.membershipEnded),
        ])
    func aRefusedHandshakeStops(status: Int, expected: RelayState) async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()

        await transport.nextOpening().refuse(status)

        await waitFor(expected, in: updates)
        #expect(await connection.isRunning == false)
    }

    @Test(
        arguments: [
            (403, RelayState.invitationPending),
            (500, RelayState.unreachable),
        ])
    func aFailedHandshakeRetriesWithBackoff(status: Int, expected: RelayState) async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()

        await transport.nextOpening().refuse(status)

        await waitFor(expected, in: updates)
        #expect(await connection.isRunning)
        await clock.wakeNextSleep(of: .seconds(1))
        _ = await transport.nextOpening()
        await connection.stop()
    }

    @Test func theMembershipEndingClosesForGood() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)

        socket.push(.close(RelayClosure.membershipEnded))

        await waitFor(.membershipEnded, in: updates)
        #expect(await connection.isRunning == false)
    }

    @Test func aRevokedSessionClosesForGood() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)

        socket.push(.close(RelayClosure.sessionRevoked))

        await waitFor(.signedOut, in: updates)
        #expect(await connection.isRunning == false)
    }

    @Test(arguments: [false, true])
    func aDeviceMovedToAnotherAccountClosesForGood(duringUpgrade: Bool) async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        if duringUpgrade {
            await transport.nextOpening().close(RelayClosure.deviceRevoked)
        } else {
            let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
            await transport.nextOpening().accept(socket)
            await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
            socket.push(.close(RelayClosure.deviceRevoked))
        }

        await waitFor(.deviceMoved, in: updates)
        #expect(await connection.isRunning == false)
    }

    @Test func aSessionRevokedDuringTheUpgradeStops() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()

        await transport.nextOpening().close(RelayClosure.sessionRevoked)

        await waitFor(.signedOut, in: updates)
        #expect(await connection.isRunning == false)
    }

    @Test func hostPresenceFollowsTheRelay() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        let first = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(first)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)

        first.push(.close(RelayClosure.hostOffline))
        await waitFor(.hostOffline, in: updates)

        await clock.wakeNextSleep(of: .seconds(1))
        await transport.nextOpening().close(RelayClosure.hostOffline)
        await waitFor(.hostOffline, in: updates)

        await clock.wakeNextSleep(of: .seconds(2))
        await transport.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "s-1"))
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        await connection.stop()
    }

    @Test func aRestartingRelayReconnectsWithoutEndingTheSession() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().refuse(502)
        await clock.wakeNextSleep(of: .seconds(1))
        let first = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(first)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)

        first.push(.close(RelayClosure.serverRestarting))
        await clock.wakeNextSleep(of: .seconds(1))
        await transport.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "s-1"))

        var heard: [RelayState] = []
        for await update in updates {
            guard case .state(let state) = update else { continue }
            heard.append(state)
            if state == .online(sharedSpaceId: "s-1") { break }
        }
        #expect(heard == [.connecting, .online(sharedSpaceId: "s-1")])
        #expect(await connection.isRunning)
        await connection.stop()
    }

    @Test func theBackoffDoublesAndResetsOnceASocketOpens() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()

        await transport.nextOpening().refuse(502)
        await clock.wakeNextSleep(of: .seconds(1))
        await transport.nextOpening().refuse(502)
        await clock.wakeNextSleep(of: .seconds(2))
        await transport.nextOpening().refuse(502)
        await clock.wakeNextSleep(of: .seconds(4))
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)

        socket.push(.close(1006))

        await waitFor(.unreachable, in: updates)
        await clock.wakeNextSleep(of: .seconds(1))
        _ = await transport.nextOpening()
        await connection.stop()
    }

    @Test func theBackoffCapsAtOneMinute() {
        var backoff = Backoff(jitter: { $0 })

        let delays = (0..<9).map { _ in backoff.next() }

        #expect(delays == [1, 2, 4, 8, 16, 32, 60, 60, 60].map { Duration.seconds($0) })
    }

    @Test func callsGetTheAnswerBearingTheirId() async throws {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        _ = try await sentCall(socket)

        async let lists = connection.call("conversation_list", args: ["spaceId": "s-1"])
        let listCall = try await sentCall(socket)
        async let missions = connection.call("mission_list", args: ["spaceId": "s-1"])
        let missionCall = try await sentCall(socket)
        socket.push(.frame(#"{"id":\#(missionCall.id),"status":200,"body":"missions"}"#))
        socket.push(.frame(#"{"id":999,"status":200,"body":"stray"}"#))
        socket.push(.frame(#"{"id":\#(listCall.id),"status":500,"body":"conversations"}"#))

        #expect(listCall.command == "conversation_list")
        #expect(listCall.args == ["spaceId": "s-1"])
        #expect(listCall.id != missionCall.id)
        let listAnswer = try await lists
        let missionAnswer = try await missions
        #expect(listAnswer.status == 500)
        #expect(try listAnswer.body(as: String.self) == "conversations")
        #expect(missionAnswer.status == 200)
        #expect(try missionAnswer.body(as: String.self) == "missions")
        await connection.stop()
    }

    @Test func aCloseFailsTheCallsStillWaiting() async throws {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        _ = try await sentCall(socket)

        let answer = Task {
            try await connection.call("conversation_list", args: ["spaceId": "s-1"])
        }
        _ = try await sentCall(socket)
        socket.push(.close(RelayClosure.hostOffline))

        await #expect(throws: RelayCallError.connectionClosed) { try await answer.value }
        await connection.stop()
    }

    @Test func aCallWithoutASocketFailsAtOnce() async {
        let connection = makeConnection()

        await #expect(throws: RelayCallError.notConnected) {
            try await connection.call("conversation_list")
        }
    }

    @Test func eventsReachEverySubscriber() async throws {
        let connection = makeConnection()
        let first = await connection.updates()
        let second = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        await transport.nextOpening().accept(socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: first)

        socket.push(
            .frame(
                #"{"event":{"event":"conversation://deleted","payload":{"spaceId":"s-1","conversationId":"c-1"}}}"#
            ))

        let event = try #require(await nextEvent(in: second))
        #expect(event.name == "conversation://deleted")
        #expect(try event.payload(as: [String: String].self)["conversationId"] == "c-1")
        await connection.stop()
    }

    @Test func ninetySecondsOfSilenceDropsTheSocket() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(
            ScriptedRelaySocket(sharedSpaceId: "s-1", answersPings: false))
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)

        for _ in 0..<RelayConnection.silentPingsBeforeDrop {
            await clock.wakeNextSleep(of: RelayConnection.pingInterval)
        }

        await waitFor(.unreachable, in: updates)
        await clock.wakeNextSleep(of: .seconds(1))
        _ = await transport.nextOpening()
        await connection.stop()
    }

    @Test func aCancelledSubscriberIsDropped() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        #expect(await connection.subscriberCount == 1)
        let consumer = Task {
            for await _ in updates {}
        }

        consumer.cancel()
        await consumer.value

        while await connection.subscriberCount > 0 {
            await Task.yield()
        }
    }

    @Test func stoppingFinishesEverySubscription() async {
        let connection = makeConnection()
        let first = await connection.updates()
        let second = await connection.updates()
        await connection.start()
        await transport.nextOpening().refuse(502)
        await waitFor(.unreachable, in: first)

        await connection.stop()

        var heard: [RelayState] = []
        for await update in second {
            if case .state(let state) = update {
                heard.append(state)
            }
        }
        #expect(heard.last == .paused)
        for await _ in first {}
        #expect(await connection.subscriberCount == 0)
    }

    @Test func stoppingPausesAndStartingAgainReconnectsAtOnce() async {
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().refuse(502)
        await waitFor(.unreachable, in: updates)

        await connection.stop()
        await waitFor(.paused, in: updates)
        await connection.start()

        _ = await transport.nextOpening()
        await connection.stop()
    }
}

struct SentCall: Decodable {
    let id: Int
    let command: String
    let args: [String: String]?
}
