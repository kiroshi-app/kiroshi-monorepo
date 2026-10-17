import Foundation
import Security

protocol SessionStore {
    func load() -> Session?
    func save(_ session: Session) throws
    func clear()
}

struct KeychainError: Error, Equatable {
    let status: OSStatus
}

struct KeychainSessionStore: SessionStore {
    static let service = "com.kiroshi.app.ios.session"

    var service = Self.service

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "session",
        ]
    }

    func load() -> Session? {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess,
            let data = item as? Data
        else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    func save(_ session: Session) throws {
        clear()
        var item = query
        item[kSecValueData as String] = try JSONEncoder().encode(session)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    func clear() {
        SecItemDelete(query as CFDictionary)
    }
}
