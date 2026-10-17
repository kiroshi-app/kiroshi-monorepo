import CryptoKit
import Foundation

struct DeviceKeys: Sendable {
    let signing: Curve25519.Signing.PrivateKey
    let agreement: Curve25519.KeyAgreement.PrivateKey

    var deviceId: String {
        RelayCrypto.deviceId(of: signing.publicKey)
    }
}

enum DeviceKeysUnavailable: Error, Equatable {
    case unreadable(KeychainError)
    case malformed
    case incomplete
}

struct DeviceKeyStore: Sendable {
    static let signingAccount = "device-signing-key"
    static let agreementAccount = "device-agreement-key"

    let keychain: any KeychainItems

    func keys() async throws(DeviceKeysUnavailable) -> DeviceKeys {
        guard let signing = try await read(Self.signingAccount) else { return try await create() }
        guard let agreement = try await read(Self.agreementAccount) else { throw .incomplete }
        guard signing.count == 32, agreement.count == 32,
            let signingKey = try? Curve25519.Signing.PrivateKey(rawRepresentation: signing),
            let agreementKey = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: agreement)
        else { throw .malformed }
        return DeviceKeys(signing: signingKey, agreement: agreementKey)
    }

    private func create() async throws(DeviceKeysUnavailable) -> DeviceKeys {
        let keys = DeviceKeys(
            signing: Curve25519.Signing.PrivateKey(),
            agreement: Curve25519.KeyAgreement.PrivateKey()
        )
        do {
            try await keychain.write(keys.agreement.rawRepresentation, as: Self.agreementAccount)
            try await keychain.write(keys.signing.rawRepresentation, as: Self.signingAccount)
        } catch {
            throw .unreadable(error)
        }
        return keys
    }

    private func read(_ account: String) async throws(DeviceKeysUnavailable) -> Data? {
        do {
            return try await keychain.read(account)
        } catch {
            throw .unreadable(error)
        }
    }
}
