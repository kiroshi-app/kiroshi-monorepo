import Foundation

enum FrameCounterError: Error, Equatable {
    case unreadable
    case exhausted
}

actor FrameCounters {
    private let keychain: any KeychainItems
    private var known: [String: UInt64] = [:]
    private var unreadable: Set<String> = []
    private var queue = Task<Void, Never> {}

    init(keychain: any KeychainItems) {
        self.keychain = keychain
    }

    func nextSent(in instanceId: Space.ID, keyId: UInt32) async throws(FrameCounterError) -> UInt64
    {
        let account = "frame-ctr.sent.\(instanceId).\(keyId)"
        return try await serially { () async throws(FrameCounterError) -> UInt64 in
            let next = try await self.last(account) + 1
            guard next < RelayCrypto.counterLimit else { throw .exhausted }
            try await self.store(next, as: account)
            return next
        }
    }

    func lastAccepted(in instanceId: Space.ID, from sender: String, keyId: UInt32)
        async throws(FrameCounterError) -> UInt64
    {
        let account = acceptedAccount(instanceId, sender, keyId)
        return try await serially { () async throws(FrameCounterError) -> UInt64 in
            try await self.last(account)
        }
    }

    func accept(_ ctr: UInt64, in instanceId: Space.ID, from sender: String, keyId: UInt32)
        async throws(FrameCounterError)
    {
        let account = acceptedAccount(instanceId, sender, keyId)
        try await serially { () async throws(FrameCounterError) in
            guard try await self.last(account) < ctr else { return }
            try await self.store(ctr, as: account)
        }
    }

    private func serially<Value: Sendable>(
        _ work: @escaping @Sendable () async throws(FrameCounterError) -> Value
    ) async throws(FrameCounterError) -> Value {
        let previous = queue
        let turn = Task { () async -> Result<Value, FrameCounterError> in
            await previous.value
            do throws(FrameCounterError) {
                return .success(try await work())
            } catch {
                return .failure(error)
            }
        }
        queue = Task { _ = await turn.value }
        return try await turn.value.get()
    }

    private func last(_ account: String) async throws(FrameCounterError) -> UInt64 {
        guard !unreadable.contains(account) else { throw .unreadable }
        if let value = known[account] { return value }
        do {
            let stored = try await keychain.read(account)
            guard let stored else { return 0 }
            guard stored.count == 8 else { throw KeychainError(status: errSecDecode) }
            let value = stored.reduce(UInt64(0)) { $0 << 8 | UInt64($1) }
            known[account] = value
            return value
        } catch {
            unreadable.insert(account)
            throw .unreadable
        }
    }

    private func store(_ value: UInt64, as account: String) async throws(FrameCounterError) {
        do {
            try await keychain.write(withUnsafeBytes(of: value.bigEndian) { Data($0) }, as: account)
            known[account] = value
        } catch {
            known[account] = nil
            unreadable.insert(account)
            throw .unreadable
        }
    }

    private func acceptedAccount(_ instanceId: Space.ID, _ sender: String, _ keyId: UInt32)
        -> String
    {
        "frame-ctr.accepted.\(instanceId).\(sender).\(keyId)"
    }
}
