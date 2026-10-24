struct MissionChanged: Decodable, Equatable, Sendable {
    let missionId: String
    let state: Mission.State
    let stateSeq: Int
    let isAgentRunning: Bool
    var liveness: Mission.Liveness?
    let lastActivityAt: Int?

    private enum CodingKeys: String, CodingKey {
        case missionId
        case state
        case stateSeq
        case isAgentRunning
        case liveness
        case lastActivityAt
    }
}

extension MissionChanged {
    static let eventName = "mission://changed"

    init?(_ event: RelayEvent) {
        guard event.name == Self.eventName, let changed = try? event.payload(as: Self.self)
        else { return nil }
        self = changed
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        missionId = try container.decode(String.self, forKey: .missionId)
        state = try container.decode(Mission.State.self, forKey: .state)
        stateSeq = try container.decode(Int.self, forKey: .stateSeq)
        isAgentRunning = try container.decode(Bool.self, forKey: .isAgentRunning)
        liveness = (try? container.decodeIfPresent(String.self, forKey: .liveness))
            .flatMap(Mission.Liveness.init(rawValue:))
        lastActivityAt = try container.decodeIfPresent(Int.self, forKey: .lastActivityAt)
    }
}
