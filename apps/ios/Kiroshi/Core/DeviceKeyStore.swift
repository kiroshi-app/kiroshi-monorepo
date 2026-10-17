import CryptoKit
import Foundation
import Security

struct DeviceKeys: Sendable {
    let signing: Curve25519.Signing.PrivateKey
    let agreement: Curve25519.KeyAgreement.PrivateKey

    var deviceId: String {
        RelayCrypto.deviceId(of: signing.publicKey)
    }

    var rawRepresentation: Data {
        signing.rawRepresentation + agreement.rawRepresentation
    }
}

enum DeviceKeysUnavailable: Error, Equatable {
    case unreadable(KeychainError)
    case malformed
}

struct DeviceKeyStore: Sendable {
    static let account = "device-keys"

    let keychain: any KeychainItems

    func keys() async throws(DeviceKeysUnavailable) -> DeviceKeys {
        guard let stored = try await read() else { return try await create() }
        return try decode(stored)
    }

    private func create() async throws(DeviceKeysUnavailable) -> DeviceKeys {
        let fresh = DeviceKeys(
            signing: Curve25519.Signing.PrivateKey(),
            agreement: Curve25519.KeyAgreement.PrivateKey())
        do {
            try await keychain.add(fresh.rawRepresentation, as: Self.account)
            return fresh
        } catch let error where error.status == errSecDuplicateItem {
            guard let stored = try await read() else { throw .unreadable(error) }
            return try decode(stored)
        } catch {
            throw .unreadable(error)
        }
    }

    private func read() async throws(DeviceKeysUnavailable) -> Data? {
        do {
            return try await keychain.read(Self.account)
        } catch {
            throw .unreadable(error)
        }
    }

    private func decode(_ stored: Data) throws(DeviceKeysUnavailable) -> DeviceKeys {
        guard stored.count == 64,
            let signing = try? Curve25519.Signing.PrivateKey(rawRepresentation: stored.prefix(32)),
            let agreement = try? Curve25519.KeyAgreement.PrivateKey(
                rawRepresentation: stored.suffix(32))
        else { throw .malformed }
        return DeviceKeys(signing: signing, agreement: agreement)
    }
}
