import Foundation

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
        let failure = await withTaskCancellationHandler {
            await withCheckedContinuation { (answered: CheckedContinuation<(any Error)?, Never>) in
                sendPing { error in answered.resume(returning: error) }
            }
        } onCancel: { [task] in
            task.cancel()
        }
        if failure != nil {
            throw self.failure()
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
