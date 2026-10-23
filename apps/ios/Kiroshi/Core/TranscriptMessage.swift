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
    }

    let id: String
    let conversationId: String
    let seq: Int
    let role: Role
    let content: String
    let completion: Completion
    let createdAt: Int
    let authorBotId: String?
    var authorAccountId: String?
    var authorName: String?
    var turnId: String?
    var repliedToMessageId: String?
}
