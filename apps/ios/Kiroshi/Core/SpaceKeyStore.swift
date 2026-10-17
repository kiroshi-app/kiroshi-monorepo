import CryptoKit
import Foundation

struct SpaceKeys: Sendable {
    let spaceKey: SymmetricKey
    let keyId: UInt32
    let hostSigningKey: Curve25519.Signing.PublicKey
    let hostRelayIds: Set<String>
}

protocol SpaceKeyStore: Sendable {
    func keys(for instanceId: Space.ID, openedWith device: DeviceKeys) async -> SpaceKeys?
}

struct WrappedSpaceKey: Codable, Sendable {
    let keyId: UInt32
    let hostSigningKey: Data
    let hostRelayIds: [String]
    let sealedSpaceKey: Data
}

struct KeychainSpaceKeyStore: SpaceKeyStore {
    let keychain: any KeychainItems

    static func account(for instanceId: Space.ID) -> String {
        "space-key.\(instanceId)"
    }

    func keys(for instanceId: Space.ID, openedWith device: DeviceKeys) async -> SpaceKeys? {
        guard let item = try? await keychain.read(Self.account(for: instanceId)),
            let wrapped = try? JSONDecoder().decode(WrappedSpaceKey.self, from: item),
            let spaceKey = try? RelayCrypto.openBox(wrapped.sealedSpaceKey, with: device.agreement),
            spaceKey.count == 32,
            let hostSigningKey = try? Curve25519.Signing.PublicKey(
                rawRepresentation: wrapped.hostSigningKey)
        else { return nil }
        return SpaceKeys(
            spaceKey: SymmetricKey(data: spaceKey), keyId: wrapped.keyId,
            hostSigningKey: hostSigningKey, hostRelayIds: Set(wrapped.hostRelayIds))
    }
}
