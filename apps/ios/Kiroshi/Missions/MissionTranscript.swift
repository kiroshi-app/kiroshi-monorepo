import Foundation

struct MissionTranscript: Equatable {
    static let summonses: Set<String> = [
        "Carry out this mission.",
        "The coding agent of this mission is blocked and waiting on you.",
    ]

    var openedDay = ""
    var entries: [ThreadMessage] = []

    init() {}

    init(
        of messages: [MissionThreadMessage], openedAt: Date, time: ConversationTime,
        authorship: ThreadAuthorship = .unknownAccount
    ) {
        openedDay = time.dayLabel(for: openedAt)
        let shown = messages.sorted(by: { $0.seq < $1.seq }).compactMap {
            Self.shown($0, authorship: authorship)
        }
        entries = ThreadLayout.mark(shown, time: time, shownDay: openedAt)
    }

    static func openedLine(by companion: Companion?) -> String {
        "Mission opened by \(companion?.name ?? "the companion")"
    }

    static func upserting(_ message: MissionThreadMessage, into messages: [MissionThreadMessage])
        -> [MissionThreadMessage]
    {
        (messages.filter { $0.id != message.id } + [message]).sorted { $0.seq < $1.seq }
    }

    private static func shown(_ message: MissionThreadMessage, authorship: ThreadAuthorship)
        -> ThreadMessage?
    {
        let content = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return nil }
        let writer = authorship.author(
            role: message.role, botId: message.authorBotId, accountId: message.authorAccountId,
            name: message.authorName)
        guard !writer.isWrittenByPerson || !summonses.contains(content) else { return nil }
        return ThreadMessage(
            id: message.id, writer: writer, text: content,
            sentAt: Date(timeIntervalSince1970: TimeInterval(message.createdAt) / 1000))
    }
}
