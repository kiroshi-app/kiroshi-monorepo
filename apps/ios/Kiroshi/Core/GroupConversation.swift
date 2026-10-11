import Foundation

struct GroupConversation: Decodable, Hashable, Sendable {
    struct Participant: Decodable, Hashable, Sendable {
        let botId: String
        let name: String
        let avatarBlot: CompanionTint?
        let avatarImagePath: String?
        let leftAt: Int?
        let isDeleted: Bool

        init(
            botId: String, name: String, avatarBlot: CompanionTint? = nil,
            avatarImagePath: String? = nil, leftAt: Int? = nil, isDeleted: Bool = false
        ) {
            self.botId = botId
            self.name = name
            self.avatarBlot = avatarBlot
            self.avatarImagePath = avatarImagePath
            self.leftAt = leftAt
            self.isDeleted = isDeleted
        }

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            botId = try container.decode(String.self, forKey: .botId)
            name = try container.decode(String.self, forKey: .name)
            avatarBlot = try? container.decodeIfPresent(CompanionTint.self, forKey: .avatarBlot)
            avatarImagePath = try? container.decodeIfPresent(
                String.self, forKey: .avatarImagePath)
            leftAt = try container.decodeIfPresent(Int.self, forKey: .leftAt)
            isDeleted = try container.decodeIfPresent(Bool.self, forKey: .isDeleted) ?? false
        }

        var isPresent: Bool {
            leftAt == nil && !isDeleted
        }

        private enum CodingKeys: String, CodingKey {
            case botId
            case name
            case avatarBlot
            case avatarImagePath
            case leftAt
            case isDeleted
        }
    }

    let id: String
    let name: String
    let members: [Companion]
    let memberNames: String
    let createdAt: Int

    init(id: String, title: String, createdAt: Int, participants: [Participant]) {
        self.id = id
        self.createdAt = createdAt
        members = participants.filter(\.isPresent).map { participant in
            Companion(
                id: participant.botId, name: participant.name, tint: participant.avatarBlot,
                picturePath: participant.avatarImagePath)
        }
        let names = members.map(\.name)
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        name =
            !trimmed.isEmpty
            ? trimmed
            : !names.isEmpty
                ? names.joined(separator: ", ") : String(localized: "Untitled conversation")
        memberNames = names.formatted(.list(type: .and))
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            id: container.decode(String.self, forKey: .id),
            title: container.decode(String.self, forKey: .title),
            createdAt: container.decode(Int.self, forKey: .createdAt),
            participants: container.decode([Participant].self, forKey: .participants))
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case title
        case createdAt
        case participants
    }
}
