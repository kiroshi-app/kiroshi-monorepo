import Foundation

struct CompanionSummary: Identifiable, Equatable {
    let companion: Companion
    var conversationId: String?
    var lastMessage: MessagePreview?
    var isWorking = false
    var timeLabel: String?

    var id: Companion.ID {
        companion.id
    }

    static let placeholders = (1...5).map { index in
        CompanionSummary(
            companion: Companion(id: "placeholder-\(index)", name: "Companion"),
            lastMessage: MessagePreview(
                text: "A message from the companion", isYours: false, sentAt: .now),
            timeLabel: "00:00")
    }
}

struct MessagePreview: Equatable {
    let text: String
    let isYours: Bool
    let sentAt: Date

    init(text: String, isYours: Bool, sentAt: Date) {
        self.text = text
        self.isYours = isYours
        self.sentAt = sentAt
    }

    init(_ message: TranscriptMessage) {
        self.init(
            text: message.content, isYours: message.role == .user,
            sentAt: Date(milliseconds: message.createdAt))
    }

    init(_ message: AgentEvent.Message) {
        self.init(
            text: message.text, isYours: message.role == .user,
            sentAt: Date(milliseconds: message.timestamp))
    }

    var line: String {
        isYours ? "You: \(text)" : text
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
