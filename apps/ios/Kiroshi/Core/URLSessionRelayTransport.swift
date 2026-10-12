import Foundation
import Synchronization

struct URLSessionRelayTransport: RelayTransport {
    func open(_ request: URLRequest) async throws -> any RelaySocket {
        let socket = URLSessionRelaySocket(task: URLSession.shared.webSocketTask(with: request))
        socket.task.resume()
        do {
            try await socket.ping()
        } catch {
            socket.task.cancel()
            throw error
        }
        return socket
    }
}

final class URLSessionRelaySocket: RelaySocket {
    typealias PongHandler = @Sendable ((any Error)?) -> Void

    let task: URLSessionWebSocketTask
    private let sendPing: @Sendable (@escaping PongHandler) -> Void

    convenience init(task: URLSessionWebSocketTask) {
        self.init(task: task) { task.sendPing(pongReceiveHandler: $0) }
    }

    init(
        task: URLSessionWebSocketTask, sendPing: @escaping @Sendable (@escaping PongHandler) -> Void
    ) {
        self.task = task
        self.sendPing = sendPing
    }

    func send(_ text: String) async throws {
        do {
            try await task.send(.string(text))
        } catch {
            throw failure()
        }
    }

    func receive() async throws -> String {
        do {
            let message = try await withTaskCancellationHandler {
                try await task.receive()
            } onCancel: { [task] in
                task.cancel()
            }
            switch message {
            case .string(let text): return text
            case .data(let data): return String(decoding: data, as: UTF8.self)
            @unknown default: return ""
            }
        } catch {
            throw failure()
        }
    }

    func ping() async throws {
        let answer = PingAnswer()
        let outcome = await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                answer.wait(continuation)
                sendPing { error in answer.settle(error == nil ? .pong : .failed) }
            }
        } onCancel: { [task] in
            answer.settle(.cancelled)
            task.cancel()
        }
        switch outcome {
        case .pong: return
        case .failed: throw failure()
        case .cancelled: throw CancellationError()
        }
    }

    func close() {
        task.cancel(with: .normalClosure, reason: nil)
    }

    private func failure() -> any Error {
        if let status = (task.response as? HTTPURLResponse)?.statusCode, status != 101 {
            return RelayRefusal(status: status)
        }
        return RelayClosure(code: task.closeCode.rawValue)
    }
}

private final class PingAnswer: Sendable {
    enum Outcome: Sendable {
        case pong
        case failed
        case cancelled
    }

    private enum State: Sendable {
        case pending
        case waiting(CheckedContinuation<Outcome, Never>)
        case settled(Outcome)
    }

    private let state = Mutex(State.pending)

    func wait(_ continuation: CheckedContinuation<Outcome, Never>) {
        let settledEarly: Outcome? = state.withLock { state in
            guard case .settled(let outcome) = state else {
                state = .waiting(continuation)
                return nil
            }
            return outcome
        }
        if let settledEarly {
            continuation.resume(returning: settledEarly)
        }
    }

    func settle(_ outcome: Outcome) {
        let waiting: CheckedContinuation<Outcome, Never>? = state.withLock { state in
            switch state {
            case .pending:
                state = .settled(outcome)
                return nil
            case .waiting(let continuation):
                state = .settled(outcome)
                return continuation
            case .settled:
                return nil
            }
        }
        waiting?.resume(returning: outcome)
    }
}
