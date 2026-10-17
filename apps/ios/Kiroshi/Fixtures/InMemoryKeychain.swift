#if DEBUG
    import Foundation
    import Security

    actor InMemoryKeychain: KeychainItems {
        private(set) var items: [String: Data]
        private var failing: [String: KeychainError] = [:]
        private(set) var writes: [String] = []

        init(_ items: [String: Data] = [:]) {
            self.items = items
        }

        func fail(_ account: String, with status: OSStatus) {
            failing[account] = KeychainError(status: status)
        }

        func heal(_ account: String) {
            failing[account] = nil
        }

        func read(_ account: String) throws(KeychainError) -> Data? {
            if let failure = failing[account] { throw failure }
            return items[account]
        }

        func add(_ data: Data, as account: String) throws(KeychainError) {
            if let failure = failing[account] { throw failure }
            guard items[account] == nil else { throw KeychainError(status: errSecDuplicateItem) }
            items[account] = data
            writes.append(account)
        }

        func write(_ data: Data, as account: String) throws(KeychainError) {
            if let failure = failing[account] { throw failure }
            items[account] = data
            writes.append(account)
        }

        func delete(_ account: String) {
            items[account] = nil
        }
    }
#endif
