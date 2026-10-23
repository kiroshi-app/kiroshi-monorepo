struct QuestionRequest: Decodable, Equatable, Sendable {
    struct Option: Decodable, Equatable, Sendable {
        let label: String
        let description: String?
    }

    struct Asked: Decodable, Equatable, Sendable {
        let header: String
        let question: String
        let options: [Option]
        let multiSelect: Bool
    }

    static let messagePrefix = "question-"

    let id: String
    let questions: [Asked]

    var messageId: String {
        Self.messagePrefix + id
    }

    static func id(ofMessage messageId: String?) -> String? {
        guard let messageId, messageId.hasPrefix(messagePrefix) else { return nil }
        return String(messageId.dropFirst(messagePrefix.count))
    }
}
