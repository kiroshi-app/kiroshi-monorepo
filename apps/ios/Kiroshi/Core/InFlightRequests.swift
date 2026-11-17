import Foundation

@MainActor
final class InFlightRequests<Key: Hashable & Sendable, Value: Sendable> {
    private struct Flight {
        let request: Task<Void, Never>
        var waiters: [UUID: CheckedContinuation<Value, any Error>] = [:]
    }

    private var flights: [Key: Flight] = [:]

    func value(
        for key: Key, request: @escaping @MainActor () async throws -> Value
    ) async throws -> Value {
        let waiter = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                guard !Task.isCancelled else {
                    continuation.resume(throwing: CancellationError())
                    return
                }
                var flight = flights[key] ?? Flight(request: send(key, request))
                flight.waiters[waiter] = continuation
                flights[key] = flight
            }
        } onCancel: {
            Task { @MainActor in self.leave(waiter, of: key) }
        }
    }

    private func send(
        _ key: Key, _ request: @escaping @MainActor () async throws -> Value
    ) -> Task<Void, Never> {
        Task { [weak self] in
            let result: Result<Value, any Error>
            do {
                result = .success(try await request())
            } catch {
                result = .failure(error)
            }
            self?.land(key, with: result)
        }
    }

    private func land(_ key: Key, with result: Result<Value, any Error>) {
        guard let flight = flights.removeValue(forKey: key) else { return }
        for waiter in flight.waiters.values {
            waiter.resume(with: result)
        }
    }

    private func leave(_ waiter: UUID, of key: Key) {
        flights[key]?.waiters.removeValue(forKey: waiter)?.resume(throwing: CancellationError())
    }
}
