import Foundation
import Testing

@testable import Kiroshi

@Suite(.timeLimit(.minutes(1)))
struct RelayChallengeTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let keys: VectorKeys
    let fresh = Data(repeating: 0xc2, count: 32)
    let third = Data(repeating: 0xc3, count: 32)

    init() throws {
        keys = try VectorKeys()
    }

    func makeConnection() -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: keys.instance,
            bearer: "fixture-bearer", device: keys.device, spaceKeys: keys.spaceKeys,
            environment: RelayEnvironment(
                transport: transport, clock: clock, keychain: InMemoryKeychain(),
                spaceKeys: FixtureSpaceKeys()),
            backoff: Backoff(jitter: { $0 }))
    }

    func makeHost(holdsHello: Bool = false) -> VectorHost {
        VectorHost(keys: keys, draws: [keys.challenge, fresh, third], holdsHello: holdsHello)
    }

    func waitFor(_ expected: RelayState, in updates: AsyncStream<RelayUpdate>) async {
        for await update in updates {
            if case .state(let state) = update, state == expected {
                return
            }
        }
    }

    func nextHeard(_ host: VectorHost) async throws -> HeardFrame {
        var iterator = host.heard.makeAsyncIterator()
        return try #require(await iterator.next())
    }

    func connect(_ connection: RelayConnection, to host: VectorHost) async throws {
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        #expect(try await nextHeard(host).isHello)
        #expect(try await nextHeard(host).command == "relay_shared_space")
    }

    @Test func theSessionOpensWithASealedHelloThenCarriesTheHostChallenge() async throws {
        let connection = makeConnection()
        let host = makeHost()
        await connection.start()
        await transport.nextOpening().accept(host)

        let hello = try await nextHeard(host)
        let ask = try await nextHeard(host)

        #expect(hello.isHello)
        #expect(hello.challenge == nil)
        #expect(hello.ctr == 1)
        #expect(ask.command == "relay_shared_space")
        #expect(ask.challenge == keys.challenge)
        #expect(ask.ctr == 2)
        await connection.stop()
    }

    @Test func everyLaterFrameCarriesTheStoredChallengeAndRunsOnTheFirstTry() async throws {
        let connection = makeConnection()
        let host = makeHost()
        try await connect(connection, to: host)

        let answer = try await connection.call("conversation_list", args: ["spaceId": "s-1"])

        let call = try await nextHeard(host)
        #expect(call.command == "conversation_list")
        #expect(call.challenge == keys.challenge)
        #expect(try answer.body(as: String.self) == "ran conversation_list")
        #expect(await host.ran == ["relay_shared_space", "conversation_list"])
        await connection.stop()
    }

    @Test func aStaleChallengeIsResentOnceUnderTheFreshHello() async throws {
        let connection = makeConnection()
        let host = makeHost()
        try await connect(connection, to: host)
        await host.restarts(beforeTheNext: 1)

        let answer = try await connection.call("conversation_list", args: ["spaceId": "s-1"])

        let stale = try await nextHeard(host)
        let resent = try await nextHeard(host)
        #expect(stale.command == "conversation_list")
        #expect(stale.challenge == keys.challenge)
        #expect(resent.command == "conversation_list")
        #expect(resent.challenge == fresh)
        #expect(resent.ctr > stale.ctr)
        #expect(try answer.body(as: String.self) == "ran conversation_list")
        #expect(await host.ran == ["relay_shared_space", "conversation_list"])

        _ = try await connection.call("mission_list", args: ["spaceId": "s-1"])

        let next = try await nextHeard(host)
        #expect(next.command == "mission_list")
        #expect(next.challenge == fresh)
        await connection.stop()
    }

    @Test func aCallRefusedAgainAfterItsResendFailsTyped() async throws {
        let connection = makeConnection()
        let host = makeHost()
        try await connect(connection, to: host)
        await host.restarts(beforeTheNext: 2)

        await #expect(throws: RelayCallError.challengeRefused) {
            try await connection.call("conversation_list", args: ["spaceId": "s-1"])
        }

        #expect(try await nextHeard(host).challenge == keys.challenge)
        #expect(try await nextHeard(host).challenge == fresh)
        #expect(await host.ran == ["relay_shared_space"])
        _ = try await connection.call("mission_list", args: ["spaceId": "s-1"])
        let next = try await nextHeard(host)
        #expect(next.command == "mission_list")
        #expect(next.challenge == third)
        await connection.stop()
    }

    @Test func aReconnectSendsANewHelloAndDropsTheOldChallenge() async throws {
        let connection = makeConnection()
        let updates = await connection.updates()
        let first = makeHost()
        try await connect(connection, to: first)

        first.drop(1006)
        await waitFor(.unreachable, in: updates)
        await clock.wakeNextSleep(of: .seconds(1))
        let second = VectorHost(keys: keys, draws: [fresh], lastCtr: await first.ctr)
        await transport.nextOpening().accept(second)

        let hello = try await nextHeard(second)
        let ask = try await nextHeard(second)
        #expect(hello.isHello)
        #expect(hello.challenge == nil)
        #expect(ask.command == "relay_shared_space")
        #expect(ask.challenge == fresh)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        await connection.stop()
    }

    @Test func aCallIssuedBeforeTheHostHelloWaitsForItsChallenge() async throws {
        let connection = makeConnection()
        let host = makeHost(holdsHello: true)
        await connection.start()
        await transport.nextOpening().accept(host)
        #expect(try await nextHeard(host).isHello)

        let answer = Task {
            try await connection.call("conversation_list", args: ["spaceId": "s-1"])
        }
        _ = await clock.nextSleep(of: RelayConnection.callDeadline)
        try await host.answerTheHello()

        let ask = try await nextHeard(host)
        let call = try await nextHeard(host)
        #expect(ask.command == "relay_shared_space")
        #expect(call.command == "conversation_list")
        #expect(ask.challenge == keys.challenge)
        #expect(call.challenge == keys.challenge)
        #expect(try await answer.value.body(as: String.self) == "ran conversation_list")
        await connection.stop()
    }

    @Test func aCallStillWaitingForTheChallengeTimesOutWithoutLeaving() async throws {
        let connection = makeConnection()
        let host = makeHost(holdsHello: true)
        await connection.start()
        await transport.nextOpening().accept(host)
        #expect(try await nextHeard(host).isHello)

        let waiting = Task {
            try await connection.call("conversation_list", args: ["spaceId": "s-1"])
        }
        let deadline = try #require(await clock.nextSleep(of: RelayConnection.callDeadline))
        deadline.wake.yield()

        await #expect(throws: RelayCallError.timedOut) { try await waiting.value }
        try await host.answerTheHello()
        #expect(try await nextHeard(host).command == "relay_shared_space")
        _ = try await connection.call("mission_list", args: ["spaceId": "s-1"])
        #expect(try await nextHeard(host).command == "mission_list")
        #expect(await host.ran == ["relay_shared_space", "mission_list"])
        await connection.stop()
    }

    @Test func aHelloWhoseChallengeIsNotThirtyTwoBytesIsRefused() async throws {
        #expect(
            FrameHeader(
                instance: keys.instance, from: keys.host.deviceId, keyId: keys.keyId, ctr: 1,
                challenge: Data(count: 16)) == nil)
        let connection = makeConnection()
        let host = makeHost(holdsHello: true)
        await connection.start()
        await transport.nextOpening().accept(host)
        #expect(try await nextHeard(host).isHello)

        try await host.hello(with: fresh, onTheWire: fresh.prefix(16))
        try await host.answerTheHello()

        let ask = try await nextHeard(host)
        #expect(ask.command == "relay_shared_space")
        #expect(ask.challenge == keys.challenge)
        await connection.stop()
    }
}
