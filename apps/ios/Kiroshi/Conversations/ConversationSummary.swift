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

    var namedAuthors: [Companion] {
        switch self {
        case .companion: []
        case .group(let group): group.authors
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
    var activeAt: Date?
    var state = ConversationState.idle
    var timeLabel: String?
    var preview: String?

    var id: String {
        subject.id
    }

    var role: String? {
        guard case .companion(let companion) = subject else { return nil }
        return companion.role
    }

    var isWorking: Bool {
        state == .working
    }

    var needsYou: Bool {
        state == .needsYou
    }

    var lastActivity: Date {
        [lastMessage?.sentAt, activeAt].compactMap(\.self).max()
            ?? Date(milliseconds: subject.createdAt)
    }

    static let placeholders = [
        ("Juniper Wren", "The release notes are drafted, they’re"),
        ("Atlas", "Can you split the onboarding ticket in two, please?"),
        ("Pico Marlowe", "All checks passed, the pull"),
        ("Mira Lee", "Here are three directions for the settings sheet"),
        ("Otto", "Morning digest: two new issues"),
        ("Sol Navarro", "The build is green on every"),
    ].enumerated().map { index, line in
        ConversationSummary(
            subject: .companion(Companion(id: "placeholder-\(index)", name: line.0)),
            timeLabel: "00:00", preview: line.1)
    }
}

struct MessagePreview: Equatable {
    let text: String
    let writer: MessageAuthor
    let sentAt: Date

    init(text: String, writer: MessageAuthor, sentAt: Date) {
        self.text = text
        self.writer = writer
        self.sentAt = sentAt
    }

    init(_ message: TranscriptMessage, authorship: ThreadAuthorship) {
        self.init(
            text: message.content, writer: authorship.author(of: message),
            sentAt: Date(milliseconds: message.createdAt))
    }

    init(_ word: LastWord, authorship: ThreadAuthorship) {
        self.init(
            text: word.text ?? "",
            writer: authorship.author(
                role: word.authorBotId == nil ? .user : .assistant, botId: word.authorBotId,
                accountId: word.authorAccountId, name: word.authorName),
            sentAt: Date(milliseconds: word.at))
    }

    init(_ message: AgentEvent.Message, by authorId: Companion.ID?) {
        self.init(
            text: message.text, writer: .companion(authorId),
            sentAt: Date(milliseconds: message.timestamp))
    }

    func naming(_ authors: [Companion]) -> MessagePreview {
        MessagePreview(
            text: Mentions.shown(in: text, among: authors), writer: writer, sentAt: sentAt)
    }

    var line: String {
        line(among: [])
    }

    func line(among members: [Companion]) -> String {
        guard let author = author(among: members) else { return text }
        return "\(author): \(text)"
    }

    private func author(among members: [Companion]) -> String? {
        switch writer {
        case .you: String(localized: "You")
        case .person(_, let name): name == ThreadAuthorship.unnamed ? nil : name
        case .companion(let id): members.first { $0.id == id }?.name
        }
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
