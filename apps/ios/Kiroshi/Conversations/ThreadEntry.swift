import Foundation

enum ThreadEntry: Identifiable, Equatable {
    case message(ThreadMessage)
    case activities(ActivityGroup)

    var id: String {
        switch self {
        case .message(let message): message.id
        case .activities(let group): group.id
        }
    }
}

struct ThreadMessage: Identifiable, Equatable {
    static let runGap: TimeInterval = 5 * 60

    let id: String
    let isYours: Bool
    let sentAt: Date
    let authorId: Companion.ID?
    let author: Companion?
    private let authors: [Companion]
    private(set) var text: String
    private(set) var rendered: AttributedString
    var dayLabel: String?
    var opensRun = true

    init(
        id: String, isYours: Bool, text: String, sentAt: Date, authorId: Companion.ID? = nil,
        authors: [Companion] = []
    ) {
        self.id = id
        self.isYours = isYours
        self.sentAt = sentAt
        self.authorId = isYours ? nil : authorId
        self.authors = authors
        author = isYours ? nil : authors.first { $0.id == authorId }
        self.text = text
        rendered = Self.render(text, isYours: isYours, authors: authors)
    }

    mutating func replaceText(_ text: String) {
        guard text != self.text else { return }
        self.text = text
        rendered = Self.render(text, isYours: isYours, authors: authors)
    }

    mutating func append(_ delta: String) {
        replaceText(text + delta)
    }

    func continues(_ previous: ThreadMessage, calendar: Calendar) -> Bool {
        previous.isYours == isYours && previous.authorId == authorId
            && sentAt.timeIntervalSince(previous.sentAt) <= Self.runGap
            && calendar.isDate(previous.sentAt, inSameDayAs: sentAt)
    }

    private static func render(_ text: String, isYours: Bool, authors: [Companion])
        -> AttributedString
    {
        let shown = authors.isEmpty ? text : Mentions.names(in: text, among: authors)
        guard !isYours else { return AttributedString(shown) }
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: shown, options: options)) ?? AttributedString(shown)
    }
}

struct ActivityGroup: Identifiable, Equatable {
    struct Activity: Identifiable, Equatable {
        let id: String
        let title: String

        var tool: String {
            title.components(separatedBy: " · ").first ?? title
        }
    }

    let id: String
    var activities: [Activity]

    var summary: String {
        var counts: [(verb: Verb, count: Int)] = []
        for activity in activities {
            let verb = Verb(tool: activity.tool)
            if let index = counts.firstIndex(where: { $0.verb == verb }) {
                counts[index].count += 1
            } else {
                counts.append((verb, 1))
            }
        }
        let parts = counts.map { $0.verb.phrase(count: $0.count) }
        return "The agent \(parts.joined(separator: ", "))"
    }

    private enum Verb: Equatable {
        case read
        case ran
        case edited
        case searched
        case used

        init(tool: String) {
            switch tool {
            case "Read": self = .read
            case "Bash": self = .ran
            case "Write", "Edit", "MultiEdit", "NotebookEdit": self = .edited
            case "Grep", "Glob", "WebSearch": self = .searched
            default: self = .used
            }
        }

        func phrase(count: Int) -> String {
            switch self {
            case .read: "read \(count) \(count == 1 ? "file" : "files")"
            case .ran: "ran \(count) \(count == 1 ? "command" : "commands")"
            case .edited: "edited \(count) \(count == 1 ? "file" : "files")"
            case .searched: "searched \(count) \(count == 1 ? "time" : "times")"
            case .used: "used \(count) \(count == 1 ? "tool" : "tools")"
            }
        }
    }
}
