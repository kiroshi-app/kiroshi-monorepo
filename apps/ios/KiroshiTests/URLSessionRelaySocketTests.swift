import Foundation
import Testing

@testable import Kiroshi

@Suite(.timeLimit(.minutes(1)))
struct URLSessionRelaySocketTests {
    let idleTask = URLSession.shared.webSocketTask(with: URL(string: "wss://relay.invalid")!)
    let aborted = POSIXError(.ECONNABORTED)

    @Test func aPingAnsweredTwiceAsTheSocketCloses() async {
        let socket = URLSessionRelaySocket(task: idleTask) { [aborted] answer in
            answer(aborted)
            answer(aborted)
        }

        await #expect(throws: RelayClosure(code: 0)) { try await socket.ping() }
    }

    @Test func aPongFollowedByALateError() async throws {
        let socket = URLSessionRelaySocket(task: idleTask) { [aborted] answer in
            answer(nil)
            answer(aborted)
        }

        try await socket.ping()
    }

    @Test func aPingAnsweredWithAnError() async {
        let socket = URLSessionRelaySocket(task: idleTask) { [aborted] answer in
            answer(aborted)
        }

        await #expect(throws: RelayClosure(code: 0)) { try await socket.ping() }
    }

    @Test func cancellingAWaitingPingIgnoresItsLateAnswer() async throws {
        let (answers, sent) = AsyncStream.makeStream(of: URLSessionRelaySocket.PongHandler.self)
        let socket = URLSessionRelaySocket(task: idleTask) { sent.yield($0) }
        let ping = Task { try await socket.ping() }
        var iterator = answers.makeAsyncIterator()
        let answer = try #require(await iterator.next())

        ping.cancel()

        await #expect(throws: CancellationError.self) { try await ping.value }
        answer(nil)
        answer(aborted)
    }
}
