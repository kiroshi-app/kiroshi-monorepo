import Foundation

struct RelayDevice: Sendable {
    let keys: DeviceKeys
    let relayId: String
}

struct RelayDeviceStore: Sendable {
    let keychain: any KeychainItems

    func relayId(for accountId: String) async -> String? {
        guard let id = try? await keychain.read(account(accountId)) else { return nil }
        return String(decoding: id, as: UTF8.self)
    }

    func save(_ relayId: String, for accountId: String) async throws(KeychainError) {
        try await keychain.write(Data(relayId.utf8), as: account(accountId))
    }

    func forget(_ accountId: String) async {
        await keychain.delete(account(accountId))
    }

    private func account(_ accountId: String) -> String {
        "relay-device.\(accountId)"
    }
}
