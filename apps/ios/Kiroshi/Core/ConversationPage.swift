struct ConversationPage: Decodable, Sendable {
    let pinned: [ConversationInPage]
    let conversations: [ConversationInPage]
    let nextCursor: String?
}

struct ConversationInPage: Decodable, Sendable {
    let group: GroupConversation
    let lastActivityAt: Int
    let lastWord: LastWord?

    init(from decoder: any Decoder) throws {
        group = try GroupConversation(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        lastActivityAt = try container.decode(Int.self, forKey: .lastActivityAt)
        lastWord = try container.decodeIfPresent(LastWord.self, forKey: .lastWord)
    }

    private enum CodingKeys: String, CodingKey {
        case lastActivityAt
        case lastWord
    }
}

struct LastWord: Decodable, Equatable, Sendable {
    let text: String?
    let at: Int
    let authorBotId: String?
}
