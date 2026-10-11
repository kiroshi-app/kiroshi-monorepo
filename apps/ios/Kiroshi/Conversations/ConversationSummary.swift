import Foundation

enum ConversationSubject: Hashable, Identifiable, Sendable {
    case companion(Companion)
    case group(GroupConversation)

    var id: String {
        switch self {
        case .companion(let companion): companion.id
        case .group(let group): group.id
        }
    }

    var title: String {
        switch self {
        case .companion(let companion): companion.name
        case .group(let group): group.name
        }
    }

    var members: [Companion] {
        switch self {
        case .companion(let companion): [companion]
        case .group(let group): group.members
        }
    }

    func isGroup(_ conversationId: String) -> Bool {
        guard case .group(let group) = self else { return false }
        return group.id == conversationId
    }

    var createdAt: Int {
        switch self {
        case .companion(let companion): companion.createdAt
        case .group(let group): group.createdAt
        }
    }
}

struct ConversationSummary: Identifiable, Equatable {
    var subject: ConversationSubject
    var conversationId: String?
    var lastMessage: MessagePreview?
    var workingCompanionIds: Set<Companion.ID> = []
    var timeLabel: String?
    var preview: String?
    var workingName: String?

    var id: String {
        subject.id
    }

    var isWorking: Bool {
        !workingCompanionIds.isEmpty
    }

    var lastActivity: Date {
        lastMessage?.sentAt ?? Date(milliseconds: subject.createdAt)
    }

    static let placeholders = (1...5).map { index in
        ConversationSummary(
            subject: .companion(Companion(id: "placeholder-\(index)", name: "Companion")),
            timeLabel: "00:00", preview: "A message from the companion")
    }
}

struct MessagePreview: Equatable {
    let text: String
    let isYours: Bool
    let sentAt: Date
    let authorId: Companion.ID?

    init(text: String, isYours: Bool, sentAt: Date, authorId: Companion.ID? = nil) {
        self.text = text
        self.isYours = isYours
        self.sentAt = sentAt
        self.authorId = authorId
    }

    init(_ message: TranscriptMessage) {
        self.init(
            text: message.content, isYours: message.role == .user,
            sentAt: Date(milliseconds: message.createdAt), authorId: message.authorBotId)
    }

    init(_ message: AgentEvent.Message, by authorId: Companion.ID?) {
        self.init(
            text: message.text, isYours: message.role == .user,
            sentAt: Date(milliseconds: message.timestamp), authorId: authorId)
    }

    var line: String {
        isYours ? "You: \(text)" : text
    }

    func line(among members: [Companion]) -> String {
        guard !isYours, let speaker = members.first(where: { $0.id == authorId }) else {
            return line
        }
        return "\(speaker.name): \(text)"
    }
}

extension Date {
    init(milliseconds: Int) {
        self.init(timeIntervalSince1970: Double(milliseconds) / 1000)
    }

    var milliseconds: Int {
        Int((timeIntervalSince1970 * 1000).rounded())
    }
}
