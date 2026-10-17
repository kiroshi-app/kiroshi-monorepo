import CryptoKit
import Foundation
import Testing

@testable import Kiroshi

struct VectorKeys: Sendable {
    static let hostRelayId = "7e110000-0000-4000-8000-0000000000b1"
    static let phoneRelayId = "7e110000-0000-4000-8000-0000000000a1"

    let host: DeviceKeys
    let phone: DeviceKeys
    let spaceKey: SymmetricKey
    let keyId: UInt32
    let instance: String
    let challenge: Data

    init() throws {
        let vectors = try RelayCryptoVectorTests.snakeCase.decode(
            Vectors.self, from: Data(contentsOf: RelayCryptoVectorTests.copiedVectors))
        let frame = try #require(vectors.frames.first)
        host = try Self.keys(of: vectors.devices[0])
        phone = try Self.keys(of: vectors.devices[1])
        try #require(frame.header.from == host.deviceId && frame.header.to == phone.deviceId)
        spaceKey = SymmetricKey(data: try #require(Data(hex: frame.spaceKey)))
        keyId = frame.header.keyId
        instance = frame.header.instance
        challenge = try #require(frame.header.challenge.flatMap { Data(hex: $0) })
    }

    var spaceKeys: SpaceKeys {
        SpaceKeys(
            spaceKey: spaceKey, keyId: keyId, hostSigningKey: host.signing.publicKey,
            hostRelayIds: [Self.hostRelayId])
    }

    var device: RelayDevice {
        RelayDevice(keys: phone, relayId: Self.phoneRelayId)
    }

    private static func keys(of device: Vectors.Device) throws -> DeviceKeys {
        DeviceKeys(
            signing: try Curve25519.Signing.PrivateKey(
                rawRepresentation: try #require(Data(hex: device.signingSeed))),
            agreement: try Curve25519.KeyAgreement.PrivateKey(
                rawRepresentation: try #require(Data(hex: device.agreementSecret))))
    }
}

struct HeardFrame: Sendable {
    let ctr: UInt64
    let challenge: Data?
    let plaintext: Data

    var isHello: Bool {
        plaintext == RelayConnection.hello
    }

    var command: String? {
        (try? JSONDecoder().decode(Call.self, from: plaintext))?.command
    }

    struct Call: Decodable {
        let id: Int
        let command: String
    }
}

actor VectorHost: RelaySocket {
    private enum Inbound: Sendable {
        case frame(String)
        case close(Int)
    }

    nonisolated let heard: AsyncStream<HeardFrame>
    private nonisolated let heardContinuation: AsyncStream<HeardFrame>.Continuation
    private nonisolated let inbound: AsyncStream<Inbound>
    private nonisolated let inboundContinuation: AsyncStream<Inbound>.Continuation
    private let keys: VectorKeys
    private var draws: [Data]
    private var held: Data?
    private var restartsBeforeCalls = 0
    private var holdsHello: Bool
    private var lastAccepted: UInt64 = 0
    private(set) var ctr: UInt64
    private(set) var ran: [String] = []

    init(keys: VectorKeys, draws: [Data], holdsHello: Bool = false, lastCtr: UInt64 = 0) {
        self.keys = keys
        self.draws = draws
        self.holdsHello = holdsHello
        ctr = lastCtr
        (heard, heardContinuation) = AsyncStream.makeStream(bufferingPolicy: .unbounded)
        (inbound, inboundContinuation) = AsyncStream.makeStream(bufferingPolicy: .unbounded)
    }

    func restarts(beforeTheNext calls: Int) {
        restartsBeforeCalls = calls
    }

    func answerTheHello() throws {
        holdsHello = false
        try hello(with: draw())
    }

    func hello(with challenge: Data, onTheWire wireChallenge: Data? = nil) throws {
        try push(RelayConnection.hello, challenge: challenge, wireChallenge: wireChallenge)
    }

    nonisolated func drop(_ code: Int) {
        inboundContinuation.yield(.close(code))
    }

    func send(_ text: String) async throws {
        let frame = try JSONDecoder().decode(RelayWireFrame.self, from: Data(text.utf8))
        try #require(frame.v == 2 && frame.from == nil && frame.to == nil)
        let challenge = try frame.challenge.map { try #require(Data(base64Encoded: $0)) }
        let header = try #require(
            FrameHeader(
                instance: keys.instance, from: keys.phone.deviceId, keyId: frame.keyId,
                ctr: frame.ctr, challenge: challenge))
        let plaintext = try RelayCrypto.open(
            SealedFrame(
                ciphertext: try #require(Data(base64Encoded: frame.ct)),
                signature: try #require(Data(base64Encoded: frame.sig))),
            header: header, lastAccepted: lastAccepted, sender: keys.phone.signing.publicKey,
            spaceKey: keys.spaceKey)
        lastAccepted = frame.ctr
        let heardFrame = HeardFrame(ctr: frame.ctr, challenge: challenge, plaintext: plaintext)
        heardContinuation.yield(heardFrame)
        if heardFrame.isHello {
            if !holdsHello {
                try hello(with: draw())
            }
            return
        }
        if restartsBeforeCalls > 0 {
            restartsBeforeCalls -= 1
            held = nil
        }
        guard let held, challenge == held else {
            try hello(with: held ?? draw())
            return
        }
        let call = try JSONDecoder().decode(HeardFrame.Call.self, from: plaintext)
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

    private func draw() throws -> Data {
        let challenge = try #require(draws.first)
        draws.removeFirst()
        return challenge
    }

    private func push(_ plaintext: Data, challenge: Data?, wireChallenge: Data? = nil) throws {
        if plaintext == RelayConnection.hello, wireChallenge == nil {
            held = challenge
        }
        ctr += 1
        let header = try #require(
            FrameHeader(
                instance: keys.instance, from: keys.host.deviceId, to: keys.phone.deviceId,
                keyId: keys.keyId, ctr: ctr, challenge: challenge))
        let sealed = try RelayCrypto.seal(
            plaintext, header: header, spaceKey: keys.spaceKey, signer: keys.host.signing)
        let frame = RelayWireFrame(
            v: 2, instance: keys.instance, from: VectorKeys.hostRelayId,
            to: VectorKeys.phoneRelayId, keyId: keys.keyId, ctr: ctr,
            challenge: (wireChallenge ?? challenge)?.base64EncodedString(),
            ct: sealed.ciphertext.base64EncodedString(),
            sig: sealed.signature.base64EncodedString())
        inboundContinuation.yield(
            .frame(String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)))
    }
}
