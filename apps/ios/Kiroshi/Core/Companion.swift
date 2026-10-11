struct Companion: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let tint: CompanionTint?
    let picturePath: String?
    let createdAt: Int

    init(
        id: String, name: String, tint: CompanionTint? = nil, picturePath: String? = nil,
        createdAt: Int = 0
    ) {
        self.id = id
        self.name = name
        self.tint = tint
        self.picturePath = picturePath
        self.createdAt = createdAt
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        tint = try? container.decodeIfPresent(CompanionTint.self, forKey: .avatarBlot)
        picturePath = try? container.decodeIfPresent(String.self, forKey: .avatarImagePath)
        createdAt = (try? container.decodeIfPresent(Int.self, forKey: .createdAt)) ?? 0
    }

    var pictureFile: String? {
        picturePath?.split(separator: "/").last.map(String.init)
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case avatarBlot
        case avatarImagePath
        case createdAt
    }
}

enum CompanionTint: String, Decodable, Hashable, Sendable {
    case red
    case yellow
    case green
    case cyan
    case blue
    case purple
    case pink
    case orange
}
