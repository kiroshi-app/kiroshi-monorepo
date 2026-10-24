enum ConversationState: String, Decodable, Equatable, Sendable {
    case idle
    case working
    case needsYou = "needs_you"

    init(word: String?) {
        self = word.flatMap(Self.init(rawValue:)) ?? .idle
    }

    init(from decoder: any Decoder) throws {
        self.init(word: try? decoder.singleValueContainer().decode(String.self))
    }
}

struct ConversationStateChanged: Decodable, Equatable, Sendable {
    static let eventName = "conversation://state-changed"

    let conversationId: String
    let state: ConversationState
}
