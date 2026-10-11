struct TranscriptMessage: Decodable, Equatable, Sendable {
    enum Role: String, Decodable, Sendable {
        case user
        case assistant
    }

    enum Completion: String, Decodable, Sendable {
        case pending
        case streaming
        case complete
        case cancelled
        case failed
        case interrupted

        var isUnderway: Bool {
            self == .pending || self == .streaming
        }
    }

    let id: String
    let conversationId: String
    let seq: Int
    let role: Role
    let content: String
    let completion: Completion
    let createdAt: Int
    let authorBotId: String?
}
