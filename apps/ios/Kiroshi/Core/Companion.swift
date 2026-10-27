struct Companion: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let role: String?
    let tint: Hue?
    let picturePath: String?
    let createdAt: Int

    init(
        id: String, name: String, role: String? = nil, tint: Hue? = nil,
        picturePath: String? = nil, createdAt: Int = 0
    ) {
        self.id = id
        self.name = name
        self.role = role
        self.tint = tint
        self.picturePath = picturePath
        self.createdAt = createdAt
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        role = (try? container.decodeIfPresent(String.self, forKey: .title))
            .flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 }
        tint = container.hue(forKey: .avatarBlot)
        picturePath = try? container.decodeIfPresent(String.self, forKey: .avatarImagePath)
        createdAt = (try? container.decodeIfPresent(Int.self, forKey: .createdAt)) ?? 0
    }

    var pictureFile: String? {
        picturePath?.split(separator: "/").last.map(String.init)
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case title
        case avatarBlot
        case avatarImagePath
        case createdAt
    }
}
