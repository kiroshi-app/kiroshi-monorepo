import CryptoKit
import Foundation

enum DeviceProof {
    static let context = Data("kiroshi-device-register-v1".utf8)
    static let nonceLength = 32

    static func message(
        userId: String, signingKey: Curve25519.Signing.PublicKey, nonce: Data
    ) -> Data {
        context + Data(userId.utf8) + signingKey.rawRepresentation + nonce
    }
}

extension DeviceKeys {
    func registrationSignature(userId: String, nonce: Data) throws -> Data {
        try signing.signature(
            for: DeviceProof.message(userId: userId, signingKey: signing.publicKey, nonce: nonce))
    }
}
