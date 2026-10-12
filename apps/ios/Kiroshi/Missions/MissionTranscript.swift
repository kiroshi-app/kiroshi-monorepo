import Foundation

struct MissionTranscript: Equatable {
    static let summonses: Set<String> = [
        "Carry out this mission.",
        "The coding agent of this mission is blocked and waiting on you.",
    ]

    var openedDay = ""
    var entries: [ThreadMessage] = []

    init() {}

    init(of messages: [MissionThreadMessage], openedAt: Date, time: ConversationTime) {
        openedDay = time.dayLabel(for: openedAt)
        let shown = messages.sorted(by: { $0.seq < $1.seq }).compactMap(shown)
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

    private func shown(_ message: MissionThreadMessage) -> ThreadMessage? {
        let content = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return nil }
        let sentAt = Date(timeIntervalSince1970: TimeInterval(message.createdAt) / 1000)
        guard message.role == .user, message.authorBotId == nil else {
            return ThreadMessage(
                id: message.id, isYours: false, text: content, sentAt: sentAt,
                authorId: message.authorBotId)
        }
        guard !Self.summonses.contains(content) else { return nil }
        return ThreadMessage(id: message.id, isYours: true, text: content, sentAt: sentAt)
    }
}
