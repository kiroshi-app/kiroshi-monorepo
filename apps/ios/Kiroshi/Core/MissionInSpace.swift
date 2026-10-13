struct MissionInSpace: Decodable, Equatable, Sendable {
    let conversationId: String
    var mission: Mission
}

struct MissionSpacePage: Decodable, Sendable {
    let missions: [MissionInSpace]
    let nextCursor: String?
}
