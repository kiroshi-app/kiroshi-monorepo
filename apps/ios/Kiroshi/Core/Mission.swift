struct Mission: Decodable, Identifiable, Hashable, Sendable {
    enum State: String, Decodable, Sendable {
        case working
        case waitingBot = "waiting_bot"
        case waitingHuman = "waiting_human"
        case readyToMerge = "ready_to_merge"
        case failed
        case done
        case closed
    }

    enum Liveness: String, Sendable {
        case idle
        case working
        case needsYou = "needs_you"
        case readyToMerge = "ready_to_merge"
        case failed
        case done
        case closed
    }

    struct Ticket: Decodable, Hashable, Sendable {
        let externalId: String
    }

    struct Status: Decodable, Hashable, Sendable {
        let text: String
        let writtenAt: Int
    }

    let id: String
    let botId: String
    let threadConversationId: String
    let objective: String
    let ticket: Ticket
    var state: State
    var stateSeq: Int
    var isAgentRunning: Bool
    var liveness: Liveness?
    let openedAt: Int
    let closedAt: Int?
    var lastActivityAt: Int?
    let status: Status?
}

extension Mission {
    private enum CodingKeys: String, CodingKey {
        case id
        case botId
        case threadConversationId
        case objective
        case ticket
        case state
        case stateSeq
        case isAgentRunning
        case liveness
        case openedAt
        case closedAt
        case lastActivityAt
        case status
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        botId = try container.decode(String.self, forKey: .botId)
        threadConversationId = try container.decode(String.self, forKey: .threadConversationId)
        objective = try container.decode(String.self, forKey: .objective)
        ticket = try container.decode(Ticket.self, forKey: .ticket)
        state = try container.decode(State.self, forKey: .state)
        stateSeq = try container.decode(Int.self, forKey: .stateSeq)
        isAgentRunning = try container.decode(Bool.self, forKey: .isAgentRunning)
        liveness = (try? container.decodeIfPresent(String.self, forKey: .liveness))
            .flatMap(Liveness.init(rawValue:))
        openedAt = try container.decode(Int.self, forKey: .openedAt)
        closedAt = try container.decodeIfPresent(Int.self, forKey: .closedAt)
        lastActivityAt = try container.decodeIfPresent(Int.self, forKey: .lastActivityAt)
        status = try container.decodeIfPresent(Status.self, forKey: .status)
    }
}
