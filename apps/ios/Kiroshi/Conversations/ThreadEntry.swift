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
    var bubbles: [Bubble]
    var dayLabel: String?
    var time = ""
    var opensRun = true
    var closesRun = true

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
        bubbles = Self.bubbles(of: text, id: id, isYours: isYours, authors: authors)
    }

    mutating func replaceText(_ text: String) {
        guard text != self.text else { return }
        self.text = text
        rendered = Self.render(text, isYours: isYours, authors: authors)
        bubbles = Self.bubbles(of: text, id: id, isYours: isYours, authors: authors)
    }

    mutating func append(_ delta: String) {
        replaceText(text + delta)
    }

    func continues(_ previous: ThreadMessage, calendar: Calendar) -> Bool {
        previous.isYours == isYours && previous.authorId == authorId
            && sentAt.timeIntervalSince(previous.sentAt) <= Self.runGap
            && calendar.isDate(previous.sentAt, inSameDayAs: sentAt)
    }

    private static func bubbles(
        of text: String, id: String, isYours: Bool, authors: [Companion]
    ) -> [Bubble] {
        Paragraphs.split(text).enumerated().map { index, paragraph in
            Bubble(
                id: "\(id)-\(index)", text: render(paragraph, isYours: isYours, authors: authors))
        }
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

enum ThreadLayout {
    static func mark(
        _ entries: [ThreadEntry], time: ConversationTime, shownDay: Date? = nil
    ) -> [ThreadEntry] {
        var marked = entries
        var shownDay = shownDay
        var previous: ThreadMessage?
        for index in marked.indices {
            guard case .message(var message) = marked[index] else {
                previous = nil
                continue
            }
            guard !message.bubbles.isEmpty else { continue }
            let opensDay =
                shownDay.map { !time.calendar.isDate($0, inSameDayAs: message.sentAt) }
                ?? true
            message.dayLabel = opensDay ? time.dayLabel(for: message.sentAt) : nil
            message.time = time.timeLabel(for: message.sentAt)
            message.opensRun =
                !(previous.map { message.continues($0, calendar: time.calendar) } ?? false)
            shownDay = message.sentAt
            previous = message
            marked[index] = .message(message)
        }
        var nextOpensRun = true
        for index in marked.indices.reversed() {
            guard case .message(var message) = marked[index] else {
                nextOpensRun = true
                continue
            }
            guard !message.bubbles.isEmpty else { continue }
            message.closesRun = nextOpensRun
            nextOpensRun = message.opensRun
            marked[index] = .message(message)
        }
        var run: [(entry: Int, bubble: Int)] = []
        for index in marked.indices {
            guard case .message(let message) = marked[index], !message.bubbles.isEmpty else {
                continue
            }
            run += message.bubbles.indices.map { (index, $0) }
            guard message.closesRun else { continue }
            for (position, place) in run.enumerated() {
                guard case .message(var member) = marked[place.entry] else { continue }
                member.bubbles[place.bubble].position = Bubble.Position(
                    index: position, count: run.count)
                marked[place.entry] = .message(member)
            }
            run = []
        }
        return marked
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
