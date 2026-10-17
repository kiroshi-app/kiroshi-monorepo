import CryptoKit
import Foundation

enum FrameRefusal: Error, Equatable {
    case replay
    case foreignSender
    case forgedSignature
    case truncated
    case nonceMismatch
    case unauthentic
}

enum SealedBoxRefusal: Error, Equatable {
    case nonContributory
    case truncated
    case unauthentic
}

struct FrameHeader: Sendable, Equatable {
    let instance: String
    let from: String
    let to: String?
    let keyId: UInt32
    let ctr: UInt64
    let challenge: Data?

    init?(
        instance: String, from: String, to: String? = nil, keyId: UInt32, ctr: UInt64,
        challenge: Data? = nil
    ) {
        guard instance.utf8.count <= Int(UInt16.max),
            RelayCrypto.isDeviceId(from),
            to.map(RelayCrypto.isDeviceId) ?? true,
            ctr < RelayCrypto.counterLimit,
            challenge.map({ $0.count == 32 }) ?? true
        else { return nil }
        self.instance = instance
        self.from = from
        self.to = to
        self.keyId = keyId
        self.ctr = ctr
        self.challenge = challenge
    }
}

struct SealedFrame: Sendable, Equatable {
    let ciphertext: Data
    let signature: Data
}

enum RelayCrypto {
    static let counterLimit: UInt64 = 1 << 53
    static let subkeySalt = Data(SHA256.hash(data: Data("kiroshi/v2/subkey".utf8)))

    private static let smallOrderPoints = [
        "0000000000000000000000000000000000000000000000000000000000000000",
        "0100000000000000000000000000000000000000000000000000000000000000",
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
        "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
        "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
        "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
    ].compactMap { Data(hex: $0) }

    static func deviceId(of signingKey: Curve25519.Signing.PublicKey) -> String {
        Data(SHA256.hash(data: signingKey.rawRepresentation).prefix(16)).hex
    }

    static func isDeviceId(_ id: String) -> Bool {
        id.utf8.count == 32
            && id.utf8.allSatisfy { (0x30...0x39).contains($0) || (0x61...0x66).contains($0) }
    }

    static func subkey(of spaceKey: SymmetricKey, keyId: UInt32, sender: String) -> SymmetricKey {
        HKDF<SHA256>.deriveKey(
            inputKeyMaterial: spaceKey, salt: subkeySalt,
            info: Data("kiroshi/v2".utf8) + bigEndian(keyId) + deviceIdBytes(sender),
            outputByteCount: 32)
    }

    static func aad(_ header: FrameHeader) -> Data {
        var aad = Data([2])
        let instance = Data(header.instance.utf8)
        aad += bigEndian(UInt16(instance.count)) + instance
        aad += deviceIdBytes(header.from)
        if let to = header.to {
            aad += [1] + deviceIdBytes(to)
        } else {
            aad += [0]
        }
        aad += bigEndian(header.keyId) + bigEndian(header.ctr)
        if let challenge = header.challenge {
            aad += [1] + challenge
        } else {
            aad += [0]
        }
        return aad
    }

    static func seal(
        _ plaintext: Data, header: FrameHeader, spaceKey: SymmetricKey,
        signer: Curve25519.Signing.PrivateKey
    ) throws -> SealedFrame {
        let aad = aad(header)
        let box = try ChaChaPoly.seal(
            plaintext, using: subkey(of: spaceKey, keyId: header.keyId, sender: header.from),
            nonce: ChaChaPoly.Nonce(data: nonce(header.ctr)), authenticating: aad)
        let ciphertext = box.combined
        return SealedFrame(
            ciphertext: ciphertext, signature: try signer.signature(for: aad + ciphertext))
    }

    static func open(
        _ frame: SealedFrame, header: FrameHeader, lastAccepted: UInt64,
        sender: Curve25519.Signing.PublicKey, spaceKey: SymmetricKey
    ) throws(FrameRefusal) -> Data {
        guard header.ctr > lastAccepted else { throw .replay }
        guard header.from == deviceId(of: sender) else { throw .foreignSender }
        let aad = aad(header)
        guard isStrictlyValid(frame.signature, for: aad + frame.ciphertext, by: sender) else {
            throw .forgedSignature
        }
        guard frame.ciphertext.count >= 28 else { throw .truncated }
        guard Data(frame.ciphertext.prefix(12)) == nonce(header.ctr) else { throw .nonceMismatch }
        do {
            return try ChaChaPoly.open(
                ChaChaPoly.SealedBox(combined: frame.ciphertext),
                using: subkey(of: spaceKey, keyId: header.keyId, sender: header.from),
                authenticating: aad)
        } catch {
            throw .unauthentic
        }
    }

    static func isStrictlyValid(
        _ signature: Data, for message: Data, by signingKey: Curve25519.Signing.PublicKey
    ) -> Bool {
        signature.count == 64
            && !hasSmallOrder(signingKey.rawRepresentation)
            && !hasSmallOrder(signature.prefix(32))
            && signingKey.isValidSignature(signature, for: message)
    }

    static func sharedSecret(
        _ privateKey: Curve25519.KeyAgreement.PrivateKey,
        _ publicKey: Curve25519.KeyAgreement.PublicKey
    ) throws(SealedBoxRefusal) -> SharedSecret {
        let shared: SharedSecret
        do {
            shared = try privateKey.sharedSecretFromKeyAgreement(with: publicKey)
        } catch {
            throw .nonContributory
        }
        guard shared.withUnsafeBytes({ $0.contains { $0 != 0 } }) else { throw .nonContributory }
        return shared
    }

    static func sealBox(
        _ plaintext: Data, to recipient: Curve25519.KeyAgreement.PublicKey,
        ephemeral: Curve25519.KeyAgreement.PrivateKey = Curve25519.KeyAgreement.PrivateKey(),
        nonce: ChaChaPoly.Nonce = ChaChaPoly.Nonce()
    ) throws -> Data {
        let key = boxKey(
            try sharedSecret(ephemeral, recipient), ephemeral: ephemeral.publicKey,
            recipient: recipient)
        let box = try ChaChaPoly.seal(plaintext, using: key, nonce: nonce)
        return ephemeral.publicKey.rawRepresentation + box.combined
    }

    static func openBox(_ sealed: Data, with recipient: Curve25519.KeyAgreement.PrivateKey)
        throws(SealedBoxRefusal) -> Data
    {
        guard sealed.count >= 32 + 12 + 16,
            let ephemeral = try? Curve25519.KeyAgreement.PublicKey(
                rawRepresentation: sealed.prefix(32))
        else { throw .truncated }
        let key = boxKey(
            try sharedSecret(recipient, ephemeral), ephemeral: ephemeral,
            recipient: recipient.publicKey)
        do {
            return try ChaChaPoly.open(
                ChaChaPoly.SealedBox(combined: sealed.dropFirst(32)), using: key)
        } catch {
            throw .unauthentic
        }
    }

    static func joinPayload(
        signingKey: Curve25519.Signing.PublicKey, agreementKey: Curve25519.KeyAgreement.PublicKey,
        invitationSecret: SymmetricKey
    ) -> Data {
        let keys = signingKey.rawRepresentation + agreementKey.rawRepresentation
        return keys + Data(HMAC<SHA256>.authenticationCode(for: keys, using: invitationSecret))
    }

    private static func boxKey(
        _ shared: SharedSecret, ephemeral: Curve25519.KeyAgreement.PublicKey,
        recipient: Curve25519.KeyAgreement.PublicKey
    ) -> SymmetricKey {
        shared.hkdfDerivedSymmetricKey(
            using: SHA256.self, salt: ephemeral.rawRepresentation + recipient.rawRepresentation,
            sharedInfo: Data("kiroshi/v2/sealed-box".utf8), outputByteCount: 32)
    }

    private static func hasSmallOrder(_ point: Data) -> Bool {
        var masked = [UInt8](point)
        guard masked.count == 32 else { return true }
        masked[31] &= 0x7f
        return smallOrderPoints.contains(Data(masked))
    }

    private static func nonce(_ ctr: UInt64) -> Data {
        Data(count: 4) + bigEndian(ctr)
    }

    private static func deviceIdBytes(_ id: String) -> Data {
        Data(hex: id) ?? Data(count: 16)
    }

    private static func bigEndian<Value: FixedWidthInteger>(_ value: Value) -> Data {
        withUnsafeBytes(of: value.bigEndian) { Data($0) }
    }
}
