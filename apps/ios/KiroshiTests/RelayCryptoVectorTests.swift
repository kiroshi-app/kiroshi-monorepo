import CryptoKit
import Foundation
import Testing

@testable import Kiroshi

struct RelayCryptoVectorTests {
    static let folder = URL(filePath: #filePath).deletingLastPathComponent()
    static let copiedVectors = folder.appending(path: "Vectors/v2-crypto.json")
    static let sharedVectors = folder.appending(
        path: "../../app/src-tauri/tests/vectors/v2-crypto.json")
    static let sharedVectorsSHA256 =
        "37ca967280f24544ee95ae9deee001282118f3de7fff3ff7c572f57844981e71"
    static let swiftSignature = folder.appending(path: "Vectors/swift-signature.json")
    static var snakeCase: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    let vectors: Vectors

    init() throws {
        vectors = try Self.snakeCase.decode(
            Vectors.self, from: Data(contentsOf: Self.copiedVectors))
    }

    @Test func theCopyIsTheSharedFileByteForByte() throws {
        let copy = try Data(contentsOf: Self.copiedVectors)
        #expect(Data(SHA256.hash(data: copy)).hex == Self.sharedVectorsSHA256)
        if let shared = try? Data(contentsOf: Self.sharedVectors) {
            #expect(shared == copy)
        }
    }

    @Test func theBundledWordListIsTheSpecOne() {
        #expect(Fingerprint.bundledWords()?.first == "abandon")
        #expect(Fingerprint.bundledWords()?.count == 2048)
        #expect(Fingerprint.words(in: Data("abandon\n".utf8)) == nil)
    }

    @Test func devicesDeriveTheirKeysIdAndFingerprint() throws {
        let words = try #require(Fingerprint.bundledWords())
        for device in vectors.devices {
            let signing = try Curve25519.Signing.PrivateKey(
                rawRepresentation: hex(device.signingSeed))
            let agreement = try Curve25519.KeyAgreement.PrivateKey(
                rawRepresentation: hex(device.agreementSecret))
            let keys = DeviceKeys(signing: signing, agreement: agreement)

            #expect(signing.publicKey.rawRepresentation.hex == device.signingPublic)
            #expect(agreement.publicKey.rawRepresentation.hex == device.agreementPublic)
            #expect(keys.deviceId == device.deviceId)
            #expect(Fingerprint.of(signing.publicKey, words: words) == device.fingerprint)
        }
    }

    @Test func subkeysDeriveFromTheSpaceKey() throws {
        #expect(
            RelayCrypto.subkeySalt.hex
                == "16397f8b30f5e1c3ad8f362524dfb6aec017d3c65c224be8f2d75450b6c1a595")
        for vector in vectors.subkeys {
            let subkey = RelayCrypto.subkey(
                of: SymmetricKey(data: try hex(vector.spaceKey)), keyId: vector.keyId,
                sender: vector.deviceId)
            #expect(bytes(subkey).hex == vector.subkey)
        }
    }

    @Test func framesSealAndOpenAsTheVectorsSay() throws {
        for vector in vectors.frames {
            let header = try vector.header.frameHeader()
            let spaceKey = SymmetricKey(data: try hex(vector.spaceKey))
            let signing = try Curve25519.Signing.PrivateKey(
                rawRepresentation: hex(vector.signingSeed))
            let frame = SealedFrame(
                ciphertext: try hex(vector.ciphertext), signature: try hex(vector.sig))

            #expect(RelayCrypto.aad(header).hex == vector.aad)
            #expect(
                bytes(RelayCrypto.subkey(of: spaceKey, keyId: header.keyId, sender: header.from))
                    .hex == vector.subkey)
            #expect(
                try RelayCrypto.open(
                    frame, header: header, lastAccepted: 0, sender: signing.publicKey,
                    spaceKey: spaceKey) == hex(vector.plaintext))
            #expect(
                RelayCrypto.isStrictlyValid(
                    frame.signature, for: RelayCrypto.aad(header) + frame.ciphertext,
                    by: signing.publicKey))

            let sealed = try RelayCrypto.seal(
                hex(vector.plaintext), header: header, spaceKey: spaceKey, signer: signing)
            #expect(sealed.ciphertext == frame.ciphertext)
            #expect(
                RelayCrypto.isStrictlyValid(
                    sealed.signature, for: RelayCrypto.aad(header) + sealed.ciphertext,
                    by: signing.publicKey))
        }
    }

    @Test func openingRefusesInTheSpecOrder() throws {
        let vector = vectors.frames[0]
        let header = try vector.header.frameHeader()
        let spaceKey = SymmetricKey(data: try hex(vector.spaceKey))
        let sender = try Curve25519.Signing.PrivateKey(rawRepresentation: hex(vector.signingSeed))
        let frame = SealedFrame(
            ciphertext: try hex(vector.ciphertext), signature: try hex(vector.sig))
        let stranger = try Curve25519.Signing.PrivateKey(
            rawRepresentation: hex(vectors.devices[1].signingSeed))
        let open = {
            (
                frame: SealedFrame, header: FrameHeader, last: UInt64,
                signer: Curve25519.Signing.PublicKey
            ) in
            try RelayCrypto.open(
                frame, header: header, lastAccepted: last, sender: signer, spaceKey: spaceKey)
        }

        #expect(throws: FrameRefusal.replay) {
            try open(frame, header, header.ctr, stranger.publicKey)
        }
        #expect(throws: FrameRefusal.foreignSender) {
            try open(frame, header, 0, stranger.publicKey)
        }
        var forged = [UInt8](frame.signature)
        forged[0] ^= 1
        #expect(throws: FrameRefusal.forgedSignature) {
            try open(
                SealedFrame(ciphertext: frame.ciphertext, signature: Data(forged)), header, 0,
                sender.publicKey)
        }
        let aad = RelayCrypto.aad(header)
        let short = Data(frame.ciphertext.prefix(27))
        #expect(throws: FrameRefusal.truncated) {
            try open(
                SealedFrame(ciphertext: short, signature: try sender.signature(for: aad + short)),
                header, 0, sender.publicKey)
        }
        var shifted = [UInt8](frame.ciphertext)
        shifted[11] ^= 1
        #expect(throws: FrameRefusal.nonceMismatch) {
            try open(
                SealedFrame(
                    ciphertext: Data(shifted),
                    signature: try sender.signature(for: aad + Data(shifted))), header, 0,
                sender.publicKey)
        }
        var tampered = [UInt8](frame.ciphertext)
        tampered[20] ^= 1
        #expect(throws: FrameRefusal.unauthentic) {
            try open(
                SealedFrame(
                    ciphertext: Data(tampered),
                    signature: try sender.signature(for: aad + Data(tampered))), header, 0,
                sender.publicKey)
        }
    }

    @Test func sealedBoxesOpenAndReproduce() throws {
        for vector in vectors.sealedBoxes {
            let recipient = try Curve25519.KeyAgreement.PrivateKey(
                rawRepresentation: hex(vector.recipientSecret))
            let ephemeral = try Curve25519.KeyAgreement.PrivateKey(
                rawRepresentation: hex(vector.ephemeralSecret))

            #expect(
                try RelayCrypto.openBox(hex(vector.sealed), with: recipient)
                    == hex(vector.plaintext))
            #expect(ephemeral.publicKey.rawRepresentation.hex == vector.ephemeralPublic)
            #expect(
                try RelayCrypto.sealBox(
                    hex(vector.plaintext), to: recipient.publicKey, ephemeral: ephemeral,
                    nonce: ChaChaPoly.Nonce(data: hex(vector.nonce))
                ).hex == vector.sealed)
        }
    }

    @Test func joinPayloadsOpenToTheTwoPublicKeys() throws {
        for vector in vectors.joinPayloads {
            let host = try Curve25519.KeyAgreement.PrivateKey(
                rawRepresentation: hex(vector.hostSecret))
            let ephemeral = try Curve25519.KeyAgreement.PrivateKey(
                rawRepresentation: hex(vector.ephemeralSecret))
            let secret = SymmetricKey(data: try hex(vector.secret))
            let signing = try Curve25519.Signing.PublicKey(
                rawRepresentation: hex(vector.signingPublic))
            let agreement = try Curve25519.KeyAgreement.PublicKey(
                rawRepresentation: hex(vector.agreementPublic))

            let payload = try RelayCrypto.openBox(hex(vector.sealed), with: host)
            #expect(payload.count == 96)
            #expect(payload.prefix(32).hex == vector.signingPublic)
            #expect(payload.dropFirst(32).prefix(32).hex == vector.agreementPublic)
            #expect(
                HMAC<SHA256>.isValidAuthenticationCode(
                    payload.suffix(32), authenticating: payload.prefix(64), using: secret))
            #expect(host.publicKey.rawRepresentation.hex == vector.hostPublic)
            let built = RelayCrypto.joinPayload(
                signingKey: signing, agreementKey: agreement, invitationSecret: secret)
            #expect(built.hex == vector.payload)
            #expect(
                try RelayCrypto.sealBox(
                    built, to: host.publicKey, ephemeral: ephemeral,
                    nonce: ChaChaPoly.Nonce(data: hex(vector.nonce))
                ).hex == vector.sealed)
        }
    }

    @Test func everyNonContributoryPointIsRefused() throws {
        let recipient = Curve25519.KeyAgreement.PrivateKey()
        for point in vectors.nonContributoryPoints {
            let publicKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: hex(point))
            #expect(throws: SealedBoxRefusal.nonContributory) {
                try RelayCrypto.sharedSecret(recipient, publicKey)
            }
            #expect(throws: SealedBoxRefusal.nonContributory) {
                try RelayCrypto.openBox(hex(point) + Data(count: 28), with: recipient)
            }
        }
    }

    @Test func aSmallOrderKeyOrRIsRefusedThoughCryptoKitAcceptsIt() throws {
        let identity = try hex("0100000000000000000000000000000000000000000000000000000000000000")
        let weakKey = try Curve25519.Signing.PublicKey(rawRepresentation: identity)
        let signature = identity + Data(count: 32)
        let message = Data("any message".utf8)

        #expect(weakKey.isValidSignature(signature, for: message))
        #expect(!RelayCrypto.isStrictlyValid(signature, for: message, by: weakKey))
        let signer = Curve25519.Signing.PrivateKey()
        #expect(!RelayCrypto.isStrictlyValid(signature, for: message, by: signer.publicKey))
    }

    @Test func aNonCanonicalSIsRefused() throws {
        let signer = Curve25519.Signing.PrivateKey()
        let message = Data("any message".utf8)
        let signature = try signer.signature(for: message)
        let order = [UInt8](
            try hex("edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010"))
        var s = [UInt8](signature.suffix(32))
        var carry = 0
        for index in 0..<32 {
            let sum = Int(s[index]) + Int(order[index]) + carry
            s[index] = UInt8(sum & 0xff)
            carry = sum >> 8
        }
        try #require(carry == 0)

        #expect(RelayCrypto.isStrictlyValid(signature, for: message, by: signer.publicKey))
        #expect(
            !RelayCrypto.isStrictlyValid(
                signature.prefix(32) + s, for: message, by: signer.publicKey))
    }

    @Test func theSwiftMadeSignatureVerifies() throws {
        let vector = try Self.snakeCase.decode(
            SignatureVector.self, from: Data(contentsOf: Self.swiftSignature))
        let signer = try Curve25519.Signing.PrivateKey(rawRepresentation: hex(vector.signingSeed))

        #expect(signer.publicKey.rawRepresentation.hex == vector.signingPublic)
        #expect(
            RelayCrypto.isStrictlyValid(
                try hex(vector.sig), for: try hex(vector.message), by: signer.publicKey))
        let again = try signer.signature(for: hex(vector.message))
        #expect(
            RelayCrypto.isStrictlyValid(again, for: try hex(vector.message), by: signer.publicKey))
    }

    private func hex(_ string: String) throws -> Data {
        try #require(Data(hex: string))
    }

    private func bytes(_ key: SymmetricKey) -> Data {
        key.withUnsafeBytes { Data($0) }
    }
}

struct Vectors: Decodable {
    struct Device: Decodable {
        let signingSeed: String
        let signingPublic: String
        let agreementSecret: String
        let agreementPublic: String
        let deviceId: String
        let fingerprint: [String]
    }

    struct Subkey: Decodable {
        let spaceKey: String
        let keyId: UInt32
        let deviceId: String
        let subkey: String
    }

    struct Header: Decodable {
        let v: Int
        let instance: String
        let from: String
        let to: String?
        let keyId: UInt32
        let ctr: String
        let challenge: String?

        func frameHeader() throws -> FrameHeader {
            try #require(v == 2)
            let ctr = try #require(UInt64(ctr))
            let challenge = try challenge.map { try #require(Data(hex: $0)) }
            return try #require(
                FrameHeader(
                    instance: instance, from: from, to: to, keyId: keyId, ctr: ctr,
                    challenge: challenge))
        }
    }

    struct Frame: Decodable {
        let spaceKey: String
        let subkey: String
        let signingSeed: String
        let signingPublic: String
        let header: Header
        let aad: String
        let plaintext: String
        let ciphertext: String
        let sig: String
    }

    struct SealedBox: Decodable {
        let recipientSecret: String
        let recipientPublic: String
        let ephemeralSecret: String
        let ephemeralPublic: String
        let nonce: String
        let plaintext: String
        let sealed: String
    }

    struct JoinPayload: Decodable {
        let secret: String
        let signingPublic: String
        let agreementPublic: String
        let payload: String
        let hostSecret: String
        let hostPublic: String
        let ephemeralSecret: String
        let nonce: String
        let sealed: String
    }

    let devices: [Device]
    let subkeys: [Subkey]
    let frames: [Frame]
    let sealedBoxes: [SealedBox]
    let joinPayloads: [JoinPayload]
    let nonContributoryPoints: [String]
}

struct SignatureVector: Decodable {
    let signingSeed: String
    let signingPublic: String
    let message: String
    let sig: String
}
