import Foundation

struct RelayAnswer: Sendable {
    let status: Int
    let frame: Data

    var isUnknownToTheHost: Bool {
        status == 403 && (try? body(as: String.self)) == "this command belongs to the host"
    }

    func body<Body: Decodable>(as type: Body.Type) throws -> Body {
        try JSONDecoder().decode(Envelope<Body>.self, from: frame).body
    }

    private struct Envelope<Body: Decodable>: Decodable {
        let body: Body
    }
}
