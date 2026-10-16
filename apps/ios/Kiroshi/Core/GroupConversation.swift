import Foundation

struct GroupConversation: Decodable, Hashable, Sendable {
    struct Participant: Decodable, Hashable, Sendable {
        let botId: String
        let name: String
        let avatarBlot: CompanionTint?
        let avatarImagePath: String?
        let leftAt: Int?
        let isDeleted: Bool
        let isLead: Bool

        init(
            botId: String, name: String, avatarBlot: CompanionTint? = nil,
            avatarImagePath: String? = nil, leftAt: Int? = nil, isDeleted: Bool = false,
            isLead: Bool = false
        ) {
            self.botId = botId
            self.name = name
            self.avatarBlot = avatarBlot
            self.avatarImagePath = avatarImagePath
            self.leftAt = leftAt
            self.isDeleted = isDeleted
            self.isLead = isLead
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
            isLead = (try? container.decodeIfPresent(String.self, forKey: .role)) == "lead"
        }

        var isPresent: Bool {
            leftAt == nil && !isDeleted
        }

        var companion: Companion {
            Companion(id: botId, name: name, tint: avatarBlot, picturePath: avatarImagePath)
        }

        private enum CodingKeys: String, CodingKey {
            case botId
            case name
            case avatarBlot
            case avatarImagePath
            case leftAt
            case isDeleted
            case role
        }
    }

    let id: String
    let name: String
    let members: [Companion]
    let authors: [Companion]
    let leadId: Companion.ID?
    let memberNames: String
    let createdAt: Int
    let icon: ConversationIcon
    let color: CompanionTint?

    init(
        id: String, title: String, createdAt: Int, participants: [Participant],
        icon: ConversationIcon = .messageSquare, color: CompanionTint? = nil
    ) {
        self.id = id
        self.createdAt = createdAt
        self.icon = icon
        self.color = color
        let present = participants.filter(\.isPresent)
        members = present.map(\.companion)
        authors = participants.map(\.companion)
        leadId = present.first(where: \.isLead)?.botId
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
            participants: container.decode([Participant].self, forKey: .participants),
            icon: ConversationIcon(
                named: try? container.decodeIfPresent(String.self, forKey: .icon)),
            color: try? container.decodeIfPresent(CompanionTint.self, forKey: .color))
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case title
        case createdAt
        case participants
        case icon
        case color
    }
}
