import CryptoKit
import Foundation
import OSLog
import Testing

@testable import Kiroshi

@Suite(.timeLimit(.minutes(1)))
struct SpaceKeyRotationTests {
    static let instance = "studio"
    static let challenge = Data(repeating: 0xc1, count: 32)

    let transport = TestRelayTransport()
    let keychain = InMemoryKeychain()
    let first = RotatingHost.Key(keyId: 1, spaceKey: SymmetricKey(size: .bits256))
    let second = RotatingHost.Key(keyId: 2, spaceKey: SymmetricKey(size: .bits256))

    var store: KeychainSpaceKeyStore {
        KeychainSpaceKeyStore(keychain: keychain)
    }

    func makeConnection(holding key: RotatingHost.Key) -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: Self.instance,
            bearer: "fixture-bearer", device: FixtureKeys.device, spaceKeys: key.spaceKeys,
            environment: RelayEnvironment(
                transport: transport, clock: TestRelayClock(), keychain: keychain,
                spaceKeys: store),
            backoff: Backoff(jitter: { $0 }))
    }

    func waitForOnline(_ updates: AsyncStream<RelayUpdate>) async {
        for await update in updates {
            if case .state(.online(sharedSpaceId: "s-1")) = update {
                return
            }
        }
    }

    func heard(_ host: RotatingHost, count: Int) async -> [RotatingHost.Heard] {
        var heard: [RotatingHost.Heard] = []
        for await frame in host.heard {
            heard.append(frame)
            if heard.count == count {
                break
            }
        }
        return heard
    }

    @Test func aNewerRekeyReplacesTheHeldKeyStoresItAndSaysHelloAgain() async throws {
        let connection = makeConnection(holding: first)
        let host = RotatingHost(current: second)
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host)

        await waitForOnline(updates)

        #expect(
            await heard(host, count: 3) == [
                .hello(keyId: 1), .hello(keyId: 2), .call("relay_shared_space", keyId: 2),
            ])
        let stored = await store.keys(for: Self.instance, openedWith: FixtureKeys.member)
        #expect(stored?.keyId == 2)
        #expect(stored?.spaceKey == second.spaceKey)
        _ = try await connection.call("conversation_list")
        #expect(await host.ran == ["relay_shared_space", "conversation_list"])
        await connection.stop()
    }

    @Test(arguments: [1, 2] as [UInt32])
    func anOlderOrEqualRekeyIsRefused(keyId: UInt32) async throws {
        let connection = makeConnection(holding: second)
        let host = RotatingHost(current: second)
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host)
        await waitForOnline(updates)
        #expect(
            await heard(host, count: 2) == [
                .hello(keyId: 2), .call("relay_shared_space", keyId: 2),
            ])

        try await host.hand(keyId == first.keyId ? first : second)
        _ = try await connection.call("conversation_list")

        #expect(await heard(host, count: 1) == [.call("conversation_list", keyId: 2)])
        #expect(
            await keychain.writes.contains(KeychainSpaceKeyStore.account(for: Self.instance))
                == false)
        await connection.stop()
    }

    @Test func aNewerRekeySignedByAnotherHostIsRefusedAndLogged() async throws {
        let impostor = FixtureRekey.Device(
            keys: DeviceKeys(
                signing: Curve25519.Signing.PrivateKey(),
                agreement: Curve25519.KeyAgreement.PrivateKey()),
            relayId: FixtureKeys.hostRelayId, accountId: "noa")
        let connection = makeConnection(holding: first)
        let host = RotatingHost(current: first)
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host)
        await waitForOnline(updates)
        #expect(
            await heard(host, count: 2) == [
                .hello(keyId: 1), .call("relay_shared_space", keyId: 1),
            ])
        let handedAt = Date.now

        try await host.hand(second, signedBy: impostor)
        _ = try await connection.call("conversation_list")

        #expect(await heard(host, count: 1) == [.call("conversation_list", keyId: 1)])
        #expect(
            await keychain.writes.contains(KeychainSpaceKeyStore.account(for: Self.instance))
                == false)
        #expect(
            try relayLog(since: handedAt).contains(
                "Refused key 2 of Space \(Self.instance): another host signed it"))
        await connection.stop()
    }

    func relayLog(since date: Date) throws -> [String] {
        let log = try OSLogStore(scope: .currentProcessIdentifier)
        return try log.getEntries(
            at: log.position(date: date),
            matching: NSPredicate(
                format: "subsystem == %@ AND category == %@", "com.kiroshi.app.ios", "relay")
        )
        .compactMap { ($0 as? OSLogEntryLog)?.composedMessage }
    }

    @Test func aHeldKeyTheHostHasMovedOnFromAsksForTheCurrentKey() async throws {
        let connection = makeConnection(holding: first)
        let host = RotatingHost(current: second, answersStaleFrames: false)
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host)
        #expect(await heard(host, count: 1) == [.hello(keyId: 1)])

        try await host.announce("conversation.changed")
        try await host.announce("conversation.changed")

        await waitForOnline(updates)
        #expect(
            await heard(host, count: 3) == [
                .keyRequest, .hello(keyId: 2), .call("relay_shared_space", keyId: 2),
            ])
        #expect(
            await store.keys(for: Self.instance, openedWith: FixtureKeys.member)?.keyId == 2)
        await connection.stop()
    }
}

actor RotatingHost: RelaySocket {
    struct Key: Sendable {
        let keyId: UInt32
        let spaceKey: SymmetricKey

        var spaceKeys: SpaceKeys {
            SpaceKeys(
                spaceKey: spaceKey, keyId: keyId,
                hostSigningKey: FixtureKeys.host.signing.publicKey,
                hostRelayIds: [FixtureKeys.hostRelayId])
        }
    }

    enum Heard: Equatable, Sendable {
        case hello(keyId: UInt32)
        case call(String, keyId: UInt32)
        case keyRequest
    }

    private enum Inbound: Sendable {
        case frame(String)
        case close(Int)
    }

    nonisolated let heard: AsyncStream<Heard>
    private nonisolated let heardContinuation: AsyncStream<Heard>.Continuation
    private nonisolated let inbound: AsyncStream<Inbound>
    private nonisolated let inboundContinuation: AsyncStream<Inbound>.Continuation
    private let current: Key
    private let answersStaleFrames: Bool
    private var ctr: UInt64 = 0
    private(set) var ran: [String] = []

    init(current: Key, answersStaleFrames: Bool = true) {
        self.current = current
        self.answersStaleFrames = answersStaleFrames
        (heard, heardContinuation) = AsyncStream.makeStream(bufferingPolicy: .unbounded)
        (inbound, inboundContinuation) = AsyncStream.makeStream(bufferingPolicy: .unbounded)
    }

    func hand(_ key: Key, signedBy signer: FixtureRekey.Device = FixtureRekey.host) throws {
        inboundContinuation.yield(
            .frame(
                try FixtureRekey.frame(
                    instance: SpaceKeyRotationTests.instance,
                    rostering: [signer, FixtureRekey.member], spaceKey: key.spaceKey,
                    keyId: key.keyId, signer: signer.keys)))
    }

    func announce(_ event: String) throws {
        try push(Data(#"{"event":"\#(event)"}"#.utf8), challenge: nil)
    }

    func send(_ text: String) async throws {
        let frame = try JSONDecoder().decode(RelayWireFrame.self, from: Data(text.utf8))
        guard frame.keyId != RelayConnection.noKeyId else {
            heardContinuation.yield(.keyRequest)
            try hand(current)
            return
        }
        let challenge = try frame.challenge.map { try #require(Data(base64Encoded: $0)) }
        guard frame.keyId == current.keyId else {
            heardContinuation.yield(.hello(keyId: frame.keyId))
            if answersStaleFrames {
                try hand(current)
            }
            return
        }
        let header = try #require(
            FrameHeader(
                instance: SpaceKeyRotationTests.instance, from: FixtureKeys.member.deviceId,
                keyId: frame.keyId, ctr: frame.ctr, challenge: challenge))
        let plaintext = try RelayCrypto.open(
            SealedFrame(
                ciphertext: try #require(Data(base64Encoded: frame.ct)),
                signature: try #require(Data(base64Encoded: frame.sig))),
            header: header, lastAccepted: 0, sender: FixtureKeys.member.signing.publicKey,
            spaceKey: current.spaceKey)
        guard plaintext != RelayConnection.hello else {
            heardContinuation.yield(.hello(keyId: frame.keyId))
            try hand(current)
            try push(RelayConnection.hello, challenge: SpaceKeyRotationTests.challenge)
            return
        }
        let call = try JSONDecoder().decode(HeardFrame.Call.self, from: plaintext)
        heardContinuation.yield(.call(call.command, keyId: frame.keyId))
        guard challenge == SpaceKeyRotationTests.challenge else { return }
        ran.append(call.command)
        let body =
            call.command == "relay_shared_space"
            ? #"{"spaceId":"s-1"}"# : #""ran \#(call.command)""#
        try push(Data(#"{"id":\#(call.id),"status":200,"body":\#(body)}"#.utf8), challenge: nil)
    }

    nonisolated func receive() async throws -> String {
        var iterator = inbound.makeAsyncIterator()
        switch await iterator.next() {
        case .frame(let text): return text
        case .close(let code): throw RelayClosure(code: code)
        case nil: throw CancellationError()
        }
    }

    nonisolated func ping() async throws {}

    nonisolated func close() {
        inboundContinuation.yield(.close(1000))
    }

    private func push(_ plaintext: Data, challenge: Data?) throws {
        ctr += 1
        let header = try #require(
            FrameHeader(
                instance: SpaceKeyRotationTests.instance, from: FixtureKeys.host.deviceId,
                to: FixtureKeys.member.deviceId, keyId: current.keyId, ctr: ctr,
                challenge: challenge))
        let sealed = try RelayCrypto.seal(
            plaintext, header: header, spaceKey: current.spaceKey,
            signer: FixtureKeys.host.signing)
        let frame = RelayWireFrame(
            v: 2, instance: SpaceKeyRotationTests.instance, from: FixtureKeys.hostRelayId,
            to: FixtureKeys.memberRelayId, keyId: current.keyId, ctr: ctr,
            challenge: challenge?.base64EncodedString(),
            ct: sealed.ciphertext.base64EncodedString(),
            sig: sealed.signature.base64EncodedString())
        inboundContinuation.yield(
            .frame(String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)))
    }
}
