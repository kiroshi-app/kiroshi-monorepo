struct ConversationPage: Decodable, Sendable {
    let pinned: [ConversationInPage]
    let conversations: [ConversationInPage]
    let nextCursor: String?
}

struct ConversationInPage: Decodable, Sendable {
    let group: GroupConversation
    let lastActivityAt: Int
    let lastWord: LastWord?
    let soloBotId: Companion.ID?
    let sectionId: String?
    let pinPosition: Int?
    let state: ConversationState

    init(from decoder: any Decoder) throws {
        group = try GroupConversation(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        lastActivityAt = try container.decode(Int.self, forKey: .lastActivityAt)
        lastWord = try container.decodeIfPresent(LastWord.self, forKey: .lastWord)
        soloBotId = try container.decodeIfPresent(String.self, forKey: .soloBotId)
        sectionId = try container.decodeIfPresent(String.self, forKey: .sectionId)
        pinPosition = try container.decodeIfPresent(Int.self, forKey: .pinPosition)
        state = try container.decodeIfPresent(ConversationState.self, forKey: .state) ?? .idle
    }

    private enum CodingKeys: String, CodingKey {
        case lastActivityAt
        case lastWord
        case soloBotId
        case sectionId
        case pinPosition
        case state
    }

    var groupPlace: PinPlace? {
        guard soloBotId == nil else { return nil }
        return PinPlace(id: group.id, sectionId: sectionId, pinPosition: pinPosition)
    }
}

struct CompanionInRoster: Decodable, Sendable {
    let companion: Companion
    let place: PinPlace

    init(from decoder: any Decoder) throws {
        companion = try Companion(from: decoder)
        place = try PinPlace(from: decoder)
    }
}

struct LastWord: Decodable, Equatable, Sendable {
    let text: String?
    let at: Int
    let authorBotId: String?
    let authorAccountId: String?
    let authorName: String?
}
