import Foundation

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
    private(set) var attachedFiles: [String]
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
        let shown = Self.shown(text, isYours: isYours)
        attachedFiles = shown.files
        rendered = Self.render(shown.text, isYours: isYours, authors: authors)
        bubbles = Self.bubbles(of: shown.text, id: id, isYours: isYours, authors: authors)
    }

    mutating func replaceText(_ text: String) {
        guard text != self.text else { return }
        self.text = text
        let shown = Self.shown(text, isYours: isYours)
        attachedFiles = shown.files
        rendered = Self.render(shown.text, isYours: isYours, authors: authors)
        bubbles = Self.bubbles(of: shown.text, id: id, isYours: isYours, authors: authors)
    }

    mutating func append(_ delta: String) {
        replaceText(text + delta)
    }

    func continues(_ previous: ThreadMessage, calendar: Calendar) -> Bool {
        previous.isYours == isYours && previous.authorId == authorId
            && sentAt.timeIntervalSince(previous.sentAt) <= Self.runGap
            && calendar.isDate(previous.sentAt, inSameDayAs: sentAt)
    }

    private static func shown(_ text: String, isYours: Bool) -> (text: String, files: [String]) {
        guard isYours else { return (text, []) }
        let split = AttachmentBlock.split(text)
        guard !split.text.isEmpty else { return (split.names.joined(separator: "\n"), []) }
        return (split.text, split.names)
    }

    private static func bubbles(
        of text: String, id: String, isYours: Bool, authors: [Companion]
    ) -> [Bubble] {
        guard !isYours else {
            let whole = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !whole.isEmpty else { return [] }
            return [Bubble(id: "\(id)-0", text: render(whole, isYours: true, authors: authors))]
        }
        return Paragraphs.split(text).enumerated().map { index, paragraph in
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
        _ messages: [ThreadMessage], time: ConversationTime, shownDay: Date? = nil
    ) -> [ThreadMessage] {
        var marked = messages
        var shownDay = shownDay
        var previous: ThreadMessage?
        for index in marked.indices where !marked[index].bubbles.isEmpty {
            let sentAt = marked[index].sentAt
            let opensDay =
                shownDay.map { !time.calendar.isDate($0, inSameDayAs: sentAt) } ?? true
            marked[index].dayLabel = opensDay ? time.dayLabel(for: sentAt) : nil
            marked[index].time = time.timeLabel(for: sentAt)
            marked[index].opensRun =
                !(previous.map { marked[index].continues($0, calendar: time.calendar) } ?? false)
            shownDay = sentAt
            previous = marked[index]
        }
        var nextOpensRun = true
        for index in marked.indices.reversed() where !marked[index].bubbles.isEmpty {
            marked[index].closesRun = nextOpensRun
            nextOpensRun = marked[index].opensRun
        }
        var run: [(message: Int, bubble: Int)] = []
        for index in marked.indices where !marked[index].bubbles.isEmpty {
            run += marked[index].bubbles.indices.map { (index, $0) }
            guard marked[index].closesRun else { continue }
            for (position, place) in run.enumerated() {
                marked[place.message].bubbles[place.bubble].position = Bubble.Position(
                    index: position, count: run.count)
            }
            run = []
        }
        return marked
    }
}
