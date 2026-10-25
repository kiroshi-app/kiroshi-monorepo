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

struct PendingPrompt: Decodable, Hashable, Sendable {
    let promptId: String
    let text: String
}

struct ObservedState: Decodable, Equatable, Sendable {
    var state = ConversationState.idle
    var pendingPrompt: PendingPrompt?
    var workingBotIds: [Companion.ID] = []

    init(
        state: ConversationState = .idle, pendingPrompt: PendingPrompt? = nil,
        workingBotIds: [Companion.ID] = []
    ) {
        self.state = state
        self.pendingPrompt = pendingPrompt
        self.workingBotIds = workingBotIds
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = try container.decodeIfPresent(ConversationState.self, forKey: .state) ?? .idle
        pendingPrompt = try? container.decodeIfPresent(PendingPrompt.self, forKey: .pendingPrompt)
        workingBotIds =
            (try? container.decodeIfPresent([String].self, forKey: .workingBotIds)) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case state
        case pendingPrompt
        case workingBotIds
    }
}

struct ConversationStateChanged: Decodable, Equatable, Sendable {
    static let eventName = "conversation://state-changed"

    let conversationId: String
    let observed: ObservedState

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        observed = try ObservedState(from: decoder)
    }

    private enum CodingKeys: String, CodingKey {
        case conversationId
    }
}
