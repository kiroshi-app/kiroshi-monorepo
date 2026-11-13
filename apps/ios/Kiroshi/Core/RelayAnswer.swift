import Foundation

struct RelayAnswer: Sendable {
    let status: Int
    let frame: Data

    var isUnknownToTheHost: Bool {
        switch (status, try? body(as: String.self)) {
        case (403, "this command belongs to the host"): true
        case (404, let refusal?): refusal.hasPrefix("this host knows no command named ")
        default: false
        }
    }

    func body<Body: Decodable>(as type: Body.Type) throws -> Body {
        try JSONDecoder().decode(Envelope<Body>.self, from: frame).body
    }

    private struct Envelope<Body: Decodable>: Decodable {
        let body: Body
    }
}
