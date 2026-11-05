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
                of: shown, id: id, isWrittenByPerson: writer.isWrittenByPerson, authors: authors)
            : []
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
            of: shown, id: id, isWrittenByPerson: writer.isWrittenByPerson, authors: authors)
    }

    mutating func append(_ delta: String) {
        replaceText(text + delta)
    }

    func continues(_ previous: ThreadMessage, calendar: Calendar) -> Bool {
        previous.writer == writer
            && sentAt.timeIntervalSince(previous.sentAt) <= Self.runGap
            && calendar.isDate(previous.sentAt, inSameDayAs: sentAt)
    }

    private struct Shown {
        let text: String
        var files: [String] = []
        var segments: [CitedSegment] = []
    }

    private static func shown(_ text: String, isWrittenByPerson: Bool) -> Shown {
        guard isWrittenByPerson else {
            let cited = CitedMessage(text)
            return Shown(text: cited.text, segments: cited.segments)
        }
        let split = AttachmentBlock.split(text)
        guard !split.text.isEmpty else { return Shown(text: split.names.joined(separator: "\n")) }
        return Shown(text: split.text, files: split.names)
    }

    private static func bubbles(
        of shown: Shown, id: String, isWrittenByPerson: Bool, authors: [Companion]
    ) -> [Bubble] {
        let whole = shown.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let rendered = render(whole, isWrittenByPerson: isWrittenByPerson, authors: authors)
        guard !isWrittenByPerson else {
            return whole.isEmpty ? [] : [Bubble(id: "\(id)-0", text: rendered)]
        }
        let messageText = Mentions.shown(in: whole, among: authors)
        let pieces = shown.segments.flatMap { segment -> [CitedPiece] in
            switch segment {
            case .text(let text):
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                return MarkdownMessage(trimmed, among: authors).bubbles.map {
                    .markdown($0.copying(messageText))
                }
            case .attachment(let attachment):
                return [.attachment(attachment)]
            }
        }
        return pieces.enumerated().map { index, piece in
            var bubble = Bubble(id: "\(id)-\(index)", text: rendered)
            switch piece {
            case .markdown(let markdown): bubble.markdown = markdown
            case .attachment(let attachment): bubble.attachment = attachment
            }
            return bubble
        }
    }

    private enum CitedPiece {
        case markdown(MarkdownMessage)
        case attachment(CitedAttachment)
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
