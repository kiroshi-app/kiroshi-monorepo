enum ConversationEvent: Equatable, Sendable {
    case messageStored(TranscriptMessage)
    case agent(AgentEvent)
    case companionsChanged
    case groupCreated(GroupConversation)
    case groupUpdated(GroupConversation)
    case groupDeleted(id: String)
    case stateChanged(ConversationStateChanged)

    init?(_ event: RelayEvent) {
        switch event.name {
        case "conversation://message-stored":
            guard let message = try? event.payload(as: TranscriptMessage.self) else { return nil }
            self = .messageStored(message)
        case "agent://event":
            guard let agent = try? event.payload(as: AgentEvent.self) else { return nil }
            self = .agent(agent)
        case "conversation://created":
            guard let stored = try? event.payload(as: GroupStored.self) else { return nil }
            self = .groupCreated(stored.conversation)
        case "conversation://updated":
            guard let stored = try? event.payload(as: GroupStored.self) else { return nil }
            self = .groupUpdated(stored.conversation)
        case "conversation://deleted":
            guard let deleted = try? event.payload(as: GroupDeleted.self) else { return nil }
            self = .groupDeleted(id: deleted.conversationId)
        case ConversationStateChanged.eventName:
            guard let changed = try? event.payload(as: ConversationStateChanged.self) else {
                return nil
            }
            self = .stateChanged(changed)
        case "companion://created", "companion://deleted", "companion://updated":
            self = .companionsChanged
        default:
            return nil
        }
    }
}

private struct GroupStored: Decodable {
    let conversation: GroupConversation
}

private struct GroupDeleted: Decodable {
    let conversationId: String
}
