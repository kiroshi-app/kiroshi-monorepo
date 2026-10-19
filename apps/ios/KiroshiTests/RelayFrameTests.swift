import CryptoKit
import Foundation
import Security
import Testing

@testable import Kiroshi

@Suite(.timeLimit(.minutes(1)))
struct RelayFrameTests {
    static let sentCounter = "frame-ctr.sent.instance-1.7"
    static let challenge = Data(repeating: 0x5c, count: 32)

    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let keychain = InMemoryKeychain(FixtureKeys.memberKeychainItems)

    var hostDeviceId: String {
        FixtureKeys.host.deviceId
    }

    func makeConnection(spaceKeys: SpaceKeys? = FixtureKeys.spaceKeys) -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1",
            bearer: "fixture-bearer", device: FixtureKeys.device, spaceKeys: spaceKeys,
            environment: RelayEnvironment(
                transport: transport, clock: clock, keychain: keychain,
                spaceKeys: FixtureSpaceKeys()),
            backoff: Backoff(jitter: { $0 }))
    }

    func waitFor(_ expected: RelayState, in updates: AsyncStream<RelayUpdate>) async {
        for await update in updates {
            if case .state(let state) = update, state == expected {
                return
            }
        }
    }

    func nextFrame(_ socket: ScriptedRelaySocket) async throws -> RelayWireFrame {
        var iterator = socket.sent.makeAsyncIterator()
        let text = try #require(await iterator.next())
        return try JSONDecoder().decode(RelayWireFrame.self, from: Data(text.utf8))
    }

    func opened(_ frame: RelayWireFrame) throws -> SentCall {
        try JSONDecoder().decode(SentCall.self, from: plaintext(of: frame))
    }

    func plaintext(of frame: RelayWireFrame) throws -> Data {
        let header = try #require(
            FrameHeader(
                instance: frame.instance, from: FixtureKeys.member.deviceId, keyId: frame.keyId,
                ctr: frame.ctr, challenge: frame.challenge.flatMap { Data(base64Encoded: $0) }))
        return try RelayCrypto.open(
            SealedFrame(
                ciphertext: try #require(Data(base64Encoded: frame.ct)),
                signature: try #require(Data(base64Encoded: frame.sig))),
            header: header, lastAccepted: 0, sender: FixtureKeys.member.signing.publicKey,
            spaceKey: FixtureKeys.spaceKeys.spaceKey)
    }

    func hostFrame(
        _ plaintext: String, ctr: UInt64, from: String = FixtureKeys.hostRelayId,
        signer: Curve25519.Signing.PrivateKey = FixtureKeys.host.signing,
        challenge: Data? = nil
    ) throws -> String {
        let header = try #require(
            FrameHeader(
                instance: "instance-1", from: RelayCrypto.deviceId(of: signer.publicKey),
                to: FixtureKeys.member.deviceId, keyId: 7, ctr: ctr, challenge: challenge))
        let sealed = try RelayCrypto.seal(
            Data(plaintext.utf8), header: header, spaceKey: FixtureKeys.spaceKeys.spaceKey,
            signer: signer)
        let frame = RelayWireFrame(
            v: 2, instance: "instance-1", from: from, to: FixtureKeys.memberRelayId, keyId: 7,
            ctr: ctr, challenge: challenge?.base64EncodedString(),
            ct: sealed.ciphertext.base64EncodedString(),
            sig: sealed.signature.base64EncodedString())
        return String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)
    }

    func connect(
        _ connection: RelayConnection, _ updates: AsyncStream<RelayUpdate>
    ) async throws -> ScriptedRelaySocket {
        await connection.start()
        let socket = ScriptedRelaySocket()
        await transport.nextOpening().accept(socket)
        _ = try await nextFrame(socket)
        socket.push(.frame(try hostFrame(#"{"hello":{}}"#, ctr: 1, challenge: Self.challenge)))
        let ask = try opened(try await nextFrame(socket))
        socket.push(
            .frame(
                try hostFrame(#"{"id":\#(ask.id),"status":200,"body":{"spaceId":"s-1"}}"#, ctr: 2)))
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        return socket
    }

    @Test func theSocketOpensWithAHelloSealedAndSignedWithoutFromOrChallenge() async throws {
        let connection = makeConnection()
        await connection.start()
        let socket = ScriptedRelaySocket()
        await transport.nextOpening().accept(socket)

        let frame = try await nextFrame(socket)

        #expect(frame.v == 2)
        #expect(frame.instance == "instance-1")
        #expect(frame.from == nil)
        #expect(frame.to == nil)
        #expect(frame.challenge == nil)
        #expect(frame.keyId == 7)
        #expect(frame.ctr == 1)
        #expect(try plaintext(of: frame) == Data(#"{"hello":{}}"#.utf8))
        await connection.stop()
    }

    @Test func aCallLeavesUnderTheChallengeOfTheHostHello() async throws {
        let connection = makeConnection()
        await connection.start()
        let socket = ScriptedRelaySocket()
        await transport.nextOpening().accept(socket)
        _ = try await nextFrame(socket)

        socket.push(.frame(try hostFrame(#"{"hello":{}}"#, ctr: 1, challenge: Self.challenge)))

        let frame = try await nextFrame(socket)
        #expect(frame.from == nil)
        #expect(frame.challenge == Self.challenge.base64EncodedString())
        #expect(frame.ctr == 2)
        #expect(try opened(frame).command == "relay_shared_space")
        await connection.stop()
    }

    @Test func theCounterIsStoredBeforeTheFrameLeaves() async throws {
        let connection = makeConnection()
        let updates = await connection.updates()
        let socket = try await connect(connection, updates)

        async let answer = connection.call("conversation_list", args: ["spaceId": "s-1"])
        let frame = try await nextFrame(socket)

        #expect(frame.ctr == 3)
        #expect(await keychain.items[Self.sentCounter] == Data([0, 0, 0, 0, 0, 0, 0, 3]))
        let call = try opened(frame)
        socket.push(.frame(try hostFrame(#"{"id":\#(call.id),"status":200,"body":"ok"}"#, ctr: 3)))
        #expect(try await answer.body(as: String.self) == "ok")
        await connection.stop()
    }

    @Test func aCounterThatCannotBeReadSendsNothing() async throws {
        await keychain.fail(Self.sentCounter, with: errSecInteractionNotAllowed)
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        let socket = RecordingRelaySocket()
        await transport.nextOpening().accept(socket)

        await waitFor(.unreachable, in: updates)

        #expect(await socket.log.sent.isEmpty)
        await connection.stop()
    }

    @Test func onlyAFrameTheHostSignedAnswers() async throws {
        let connection = makeConnection()
        let updates = await connection.updates()
        let socket = try await connect(connection, updates)
        let stranger = Curve25519.Signing.PrivateKey()

        async let answer = connection.call("conversation_list", args: ["spaceId": "s-1"])
        let call = try opened(try await nextFrame(socket))
        let id = call.id
        socket.push(.frame(#"{"id":\#(id),"status":200,"body":"plaintext"}"#))
        socket.push(.frame(try hostFrame(#"{"id":\#(id),"status":200,"body":"replayed"}"#, ctr: 1)))
        socket.push(
            .frame(
                try hostFrame(
                    #"{"id":\#(id),"status":200,"body":"foreign"}"#, ctr: 3,
                    from: "5d2c0000-0000-4000-8000-0000000000c1")))
        socket.push(
            .frame(
                try hostFrame(
                    #"{"id":\#(id),"status":200,"body":"forged"}"#, ctr: 4, signer: stranger)))
        socket.push(
            .frame(
                try hostFrame(
                    #"{"id":\#(id),"status":200,"body":"genuine"}"#, ctr: 5,
                    challenge: Data(repeating: 0xa5, count: 32))))

        #expect(try await answer.body(as: String.self) == "genuine")
        #expect(
            await keychain.items["frame-ctr.accepted.instance-1.\(hostDeviceId).7"]
                == Data([0, 0, 0, 0, 0, 0, 0, 5]))
        await connection.stop()
    }

    @Test func aFrameReplayedAfterARestartIsRefused() async throws {
        let first = makeConnection()
        let firstUpdates = await first.updates()
        _ = try await connect(first, firstUpdates)
        await first.stop()

        let second = makeConnection()
        let updates = await second.updates()
        await second.start()
        let socket = ScriptedRelaySocket()
        await transport.nextOpening().accept(socket)
        _ = try await nextFrame(socket)
        socket.push(.frame(try hostFrame(#"{"hello":{}}"#, ctr: 3, challenge: Self.challenge)))
        let ask = try opened(try await nextFrame(socket))
        #expect(ask.command == "relay_shared_space")
        socket.push(
            .frame(
                try hostFrame(#"{"id":\#(ask.id),"status":200,"body":{"spaceId":"old"}}"#, ctr: 2)))
        socket.push(
            .frame(
                try hostFrame(#"{"id":\#(ask.id),"status":200,"body":{"spaceId":"s-1"}}"#, ctr: 4)))

        var online: RelayState?
        for await update in updates {
            if case .state(let state) = update, case .online = state {
                online = state
                break
            }
        }
        #expect(online == .online(sharedSpaceId: "s-1"))
        await second.stop()
    }

    func joiningConnection(saving store: RecordingSpaceKeys) -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1",
            bearer: "fixture-bearer", device: FixtureKeys.device, spaceKeys: nil,
            environment: RelayEnvironment(
                transport: transport, clock: clock, keychain: keychain, spaceKeys: store),
            backoff: Backoff(jitter: { $0 }))
    }

    func isKeyRequest(_ frame: RelayWireFrame) throws -> Bool {
        let header = try #require(
            FrameHeader(
                instance: frame.instance, from: FixtureKeys.member.deviceId, keyId: frame.keyId,
                ctr: frame.ctr))
        let ciphertext = try #require(Data(base64Encoded: frame.ct))
        let signature = try #require(Data(base64Encoded: frame.sig))
        return frame.keyId == RelayConnection.noKeyId && frame.ctr == 1 && frame.challenge == nil
            && RelayCrypto.isStrictlyValid(
                signature, for: RelayCrypto.aad(header) + ciphertext,
                by: FixtureKeys.member.signing.publicKey)
    }

    @Test func aSpaceWithoutKeyJoinsOnItsFirstVerifiedRekeyThenSaysHelloUnderIt() async throws {
        let store = RecordingSpaceKeys()
        let connection = joiningConnection(saving: store)
        let updates = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket()
        await transport.nextOpening().accept(socket)
        await waitFor(.joining, in: updates)

        #expect(try isKeyRequest(try await nextFrame(socket)))
        socket.push(.frame(try FixtureRekey.frame(instance: "instance-2")))
        socket.push(.frame(try FixtureRekey.frame(instance: "instance-1")))

        let hello = try await nextFrame(socket)
        #expect(hello.keyId == FixtureKeys.spaceKeys.keyId)
        #expect(try plaintext(of: hello) == RelayConnection.hello)
        #expect(await store.saved["instance-1"]?.hostRelayId == FixtureKeys.hostRelayId)
        await connection.stop()
    }

    @Test func aJoinAsksForItsKeyAgainEveryPing() async throws {
        let connection = joiningConnection(saving: RecordingSpaceKeys())
        let updates = await connection.updates()
        await connection.start()
        let socket = ScriptedRelaySocket()
        await transport.nextOpening().accept(socket)
        await waitFor(.joining, in: updates)
        #expect(try isKeyRequest(try await nextFrame(socket)))

        await clock.wakeNextSleep(of: RelayConnection.pingInterval)
        await clock.wakeNextSleep(of: RelayConnection.pingInterval)

        #expect(try isKeyRequest(try await nextFrame(socket)))
        await connection.stop()
    }

    @Test func aJoinWhoseHostIsOfflineSaysSoAndKeepsTrying() async {
        let connection = joiningConnection(saving: RecordingSpaceKeys())
        let updates = await connection.updates()
        await connection.start()

        await transport.nextOpening().close(RelayClosure.hostOffline)

        await waitFor(.hostOffline, in: updates)
        #expect(await connection.isRunning)
        await connection.stop()
    }
}

actor RecordingSpaceKeys: SpaceKeyStore {
    private(set) var saved: [Space.ID: HandedSpaceKey] = [:]

    func keys(for instanceId: Space.ID, openedWith device: DeviceKeys) async -> SpaceKeys? {
        saved[instanceId]?.spaceKeys
    }

    func save(_ handed: HandedSpaceKey, for instanceId: Space.ID, sealedTo device: DeviceKeys)
        async throws
    {
        saved[instanceId] = handed
    }
}

struct RecordingRelaySocket: RelaySocket {
    actor Log {
        private(set) var sent: [String] = []

        func append(_ text: String) {
            sent.append(text)
        }
    }

    let log = Log()
    private let inbound = AsyncStream.makeStream(of: Int.self)

    func send(_ text: String) async throws {
        await log.append(text)
    }

    func receive() async throws -> String {
        for await code in inbound.stream {
            throw RelayClosure(code: code)
        }
        throw CancellationError()
    }

    func ping() async throws {}

    func close() {
        inbound.continuation.yield(1000)
    }
}
