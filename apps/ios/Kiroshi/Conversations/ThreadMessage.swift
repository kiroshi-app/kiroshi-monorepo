import Foundation

struct ThreadMessage: Identifiable, Equatable {
    enum QuestionPart: Equatable {
        case asking(String)
        case answer(String)
    }

    static let runGap: TimeInterval = 5 * 60

    let id: String
    let writer: MessageAuthor
    let sentAt: Date
    let author: Companion?
    let initials: String
    let questionPart: QuestionPart?
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
        id: String, writer: MessageAuthor, text: String, sentAt: Date, authors: [Companion] = [],
        questionPart: QuestionPart? = nil
    ) {
        self.id = id
        self.questionPart = questionPart
        self.writer = writer
        self.sentAt = sentAt
        self.authors = authors
        author = authors.first { $0.id == writer.companionId }
        initials = writer.personName.map(Initials.of) ?? ""
        self.text = text
        let shown = Self.shown(text, isWrittenByPerson: writer.isWrittenByPerson)
        attachedFiles = shown.files
        rendered = Self.render(
            shown.text, isWrittenByPerson: writer.isWrittenByPerson, authors: authors)
        bubbles =
            questionPart == nil
            ? Self.bubbles(
                of: shown.text, id: id, isWrittenByPerson: writer.isWrittenByPerson,
                authors: authors) : []
    }

    var askedQuestionId: String? {
        guard case .asking(let id) = questionPart else { return nil }
        return id
    }

    var answeredQuestionId: String? {
        guard case .answer(let id) = questionPart else { return nil }
        return id
    }

    var isYours: Bool {
        writer == .you
    }

    var authorId: Companion.ID? {
        writer.companionId
    }

    var authorName: String? {
        writer.personName ?? author?.name
    }

    mutating func replaceText(_ text: String) {
        guard text != self.text else { return }
        self.text = text
        let shown = Self.shown(text, isWrittenByPerson: writer.isWrittenByPerson)
        attachedFiles = shown.files
        rendered = Self.render(
            shown.text, isWrittenByPerson: writer.isWrittenByPerson, authors: authors)
        guard questionPart == nil else { return }
        bubbles = Self.bubbles(
            of: shown.text, id: id, isWrittenByPerson: writer.isWrittenByPerson, authors: authors)
    }

    mutating func append(_ delta: String) {
        replaceText(text + delta)
    }

    func continues(_ previous: ThreadMessage, calendar: Calendar) -> Bool {
        previous.writer == writer
            && sentAt.timeIntervalSince(previous.sentAt) <= Self.runGap
            && calendar.isDate(previous.sentAt, inSameDayAs: sentAt)
    }

    private static func shown(_ text: String, isWrittenByPerson: Bool) -> (
        text: String, files: [String]
    ) {
        guard isWrittenByPerson else { return (text, []) }
        let split = AttachmentBlock.split(text)
        guard !split.text.isEmpty else { return (split.names.joined(separator: "\n"), []) }
        return (split.text, split.names)
    }

    private static func bubbles(
        of text: String, id: String, isWrittenByPerson: Bool, authors: [Companion]
    ) -> [Bubble] {
        let whole = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !whole.isEmpty else { return [] }
        let shown = render(whole, isWrittenByPerson: isWrittenByPerson, authors: authors)
        guard !isWrittenByPerson else { return [Bubble(id: "\(id)-0", text: shown)] }
        return MarkdownMessage(whole, among: authors).bubbles.enumerated().map { index, markdown in
            Bubble(id: "\(id)-\(index)", text: shown, markdown: markdown)
        }
    }

    private static func render(_ text: String, isWrittenByPerson: Bool, authors: [Companion])
        -> AttributedString
    {
        let shown = Mentions.shown(in: text, among: authors)
        guard !isWrittenByPerson else { return AttributedString(shown) }
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
