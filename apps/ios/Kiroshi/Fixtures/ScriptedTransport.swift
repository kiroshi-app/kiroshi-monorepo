#if DEBUG
    import Foundation

    actor ScriptedTransport: HTTPTransport {
        enum Answer: Sendable {
            case status(Int, String)
            case offline
            case pending
        }

        private var answers: [String: Answer]
        private let log: URL?
        private(set) var requests: [URLRequest] = []

        init(_ answers: [String: Answer] = [:], log: URL? = nil) {
            self.answers = [
                FixtureKeys.challengePath: FixtureKeys.challenge,
                FixtureKeys.devicesPath: FixtureKeys.registered,
            ].merging(answers) { _, scripted in scripted }
            self.log = log
        }

        func answer(_ path: String, with answer: Answer) {
            answers[path] = answer
        }

        func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
            requests.append(request)
            guard let url = request.url else { throw URLError(.badURL) }
            write(request.httpMethod ?? "GET", url.path(), to: log)
            switch answers[url.path(), default: .offline] {
            case .status(let status, let body):
                let response = HTTPURLResponse(
                    url: url, statusCode: status, httpVersion: nil, headerFields: nil)
                return (Data(body.utf8), response ?? URLResponse())
            case .offline:
                throw URLError(.notConnectedToInternet)
            case .pending:
                let (stream, continuation) = AsyncStream<Never>.makeStream()
                for await _ in stream {}
                continuation.finish()
                throw CancellationError()
            }
        }

        private func write(_ method: String, _ path: String, to log: URL?) {
            guard let log else { return }
            let line = Data("\(method) \(path)\n".utf8)
            guard let handle = try? FileHandle(forWritingTo: log) else {
                try? line.write(to: log)
                return
            }
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: line)
        }
    }
#endif
