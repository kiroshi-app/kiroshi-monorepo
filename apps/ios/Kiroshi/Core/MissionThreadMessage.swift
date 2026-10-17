struct MissionThreadMessage: Decodable, Identifiable, Equatable, Sendable {
    typealias Role = TranscriptMessage.Role

    let id: String
    let conversationId: String
    let seq: Int
    let role: Role
    let content: String
    let createdAt: Int
    let authorBotId: String?
    var authorAccountId: String?
    var authorName: String?
}
