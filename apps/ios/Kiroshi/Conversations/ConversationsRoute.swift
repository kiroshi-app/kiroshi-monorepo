enum ConversationsRoute: Hashable {
    case conversation(ConversationSubject)
    case missions(ConversationMissions)
    case mission(Mission)

    var showsMissions: Bool {
        switch self {
        case .conversation: false
        case .missions, .mission: true
        }
    }
}

struct ConversationMissions: Hashable {
    let conversationId: String
    let title: String
}
