struct Space: Decodable, Identifiable, Equatable, Sendable {
    enum Role: String, Decodable, Sendable {
        case owner
        case member
    }

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case role
        case isHostOnline = "online"
        case colour
    }

    let id: String
    let name: String
    let role: Role
    var isHostOnline: Bool
    var colour: CompanionTint?
}

extension Space {
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        role = try container.decode(Role.self, forKey: .role)
        isHostOnline = try container.decode(Bool.self, forKey: .isHostOnline)
        colour = container.tint(forKey: .colour)
    }
}

extension KeyedDecodingContainer {
    func tint(forKey key: Key) -> CompanionTint? {
        let written = try? decodeIfPresent(String.self, forKey: key)
        return written.flatMap { CompanionTint(rawValue: $0) }
    }
}
