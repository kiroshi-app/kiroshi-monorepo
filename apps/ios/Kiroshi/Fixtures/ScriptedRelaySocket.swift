#if DEBUG
    import Foundation

    final class ScriptedRelaySocket: RelaySocket {
        enum Inbound: Sendable {
            case frame(String, after: Duration = .zero)
            case close(Int)
        }

        let sent: AsyncStream<String>
        private let sentContinuation: AsyncStream<String>.Continuation
        private let inbound: AsyncStream<Inbound>
        private let inboundContinuation: AsyncStream<Inbound>.Continuation
        private let sharedSpaceId: String?
        private let answersPings: Bool
        private let answers: [String: String]
        private let answersAfter: [String: Duration]
        private let plays: [String: [Inbound]]
        private let hostLeavesAfter: String?

        init(
            sharedSpaceId: String? = nil, answersPings: Bool = true,
            answers: [String: String] = [:], answersAfter: [String: Duration] = [:],
            plays: [String: [Inbound]] = [:], hostLeavesAfter: String? = nil
        ) {
            (sent, sentContinuation) = AsyncStream.makeStream()
            (inbound, inboundContinuation) = AsyncStream.makeStream()
            self.sharedSpaceId = sharedSpaceId
            self.answersPings = answersPings
            self.answers = answers
            self.answersAfter = answersAfter
            self.plays = plays
            self.hostLeavesAfter = hostLeavesAfter
        }

        func push(_ message: Inbound) {
            inboundContinuation.yield(message)
        }

        func send(_ text: String) async throws {
            sentContinuation.yield(text)
            guard let call = try? JSONDecoder().decode(Call.self, from: Data(text.utf8)) else {
                return
            }
            if let sharedSpaceId, call.command == "relay_shared_space" {
                push(
                    .frame(
                        #"{"id":\#(call.id),"status":200,"body":{"spaceId":"\#(sharedSpaceId)"}}"#))
            } else if let body = answers[call.answerKey] {
                if let delay = answersAfter[call.answerKey] {
                    try await Task.sleep(for: delay)
                }
                push(.frame(#"{"id":\#(call.id),"status":200,"body":\#(body)}"#))
                for played in plays[call.command] ?? [] {
                    push(played)
                }
                if call.command == hostLeavesAfter {
                    push(.close(RelayClosure.hostOffline))
                }
            }
        }

        func receive() async throws -> String {
            var iterator = inbound.makeAsyncIterator()
            switch await iterator.next() {
            case .frame(let text, let delay):
                try await ContinuousClock().sleep(for: delay)
                return text
            case .close(let code): throw RelayClosure(code: code)
            case nil: throw CancellationError()
            }
        }

        func ping() async throws {
            guard answersPings else { throw RelayClosure(code: 0) }
        }

        func close() {
            push(.close(1000))
        }

        private struct Call: Decodable {
            struct Args: Decodable {
                let cursor: String?
            }

            let id: Int
            let command: String
            let args: Args?

            var answerKey: String {
                args?.cursor.map { "\(command) \($0)" } ?? command
            }
        }
    }
#endif
