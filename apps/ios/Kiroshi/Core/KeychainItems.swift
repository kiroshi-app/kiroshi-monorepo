import Foundation
import Security

protocol KeychainItems: Sendable {
    func read(_ account: String) async throws(KeychainError) -> Data?
    func add(_ data: Data, as account: String) async throws(KeychainError)
    func write(_ data: Data, as account: String) async throws(KeychainError)
    func delete(_ account: String) async
}

struct SystemKeychain: KeychainItems {
    var service = KeychainSessionStore.service

    func read(_ account: String) throws(KeychainError) -> Data? {
        var lookup = query(account)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else { throw KeychainError(status: errSecDecode) }
            return data
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError(status: status)
        }
    }

    func add(_ data: Data, as account: String) throws(KeychainError) {
        var item = query(account)
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(item as CFDictionary, nil)
        guard added == errSecSuccess else { throw KeychainError(status: added) }
    }

    func write(_ data: Data, as account: String) throws(KeychainError) {
        let updated = SecItemUpdate(
            query(account) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        guard updated == errSecItemNotFound else {
            guard updated == errSecSuccess else { throw KeychainError(status: updated) }
            return
        }
        try add(data, as: account)
    }

    func delete(_ account: String) {
        SecItemDelete(query(account) as CFDictionary)
    }

    private func query(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false,
        ]
    }
}
