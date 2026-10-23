import Foundation

struct QuestionAnswerLine: Equatable, Sendable {
    let header: String?
    let answer: String
}

struct QuestionAnswered: Equatable {
    enum Answerer: Equatable {
        case you
        case elsewhere
    }

    let by: Answerer
    let lines: [QuestionAnswerLine]

    var isSkipped: Bool {
        by == .you && lines.isEmpty
    }
}

struct QuestionAsking: Equatable {
    let question: WaitingQuestion
    var isSending = false
    var hasFailed = false
}

struct QuestionDraft: Equatable {
    let request: QuestionRequest
    private(set) var shown = 0
    private var picks: [[String]]
    private var typed: [String]
    private var skipped: Set<Int> = []

    init(request: QuestionRequest) {
        self.request = request
        picks = Array(repeating: [], count: request.questions.count)
        typed = Array(repeating: "", count: request.questions.count)
    }

    var asked: QuestionRequest.Asked {
        request.questions[shown]
    }

    var isOneOfSeveral: Bool {
        request.questions.count > 1
    }

    var other: String {
        get { typed[shown] }
        set {
            typed[shown] = newValue
            guard !Self.trimmed(newValue).isEmpty else { return }
            picks[shown] = []
            skipped.remove(shown)
        }
    }

    var hasOther: Bool {
        !Self.trimmed(typed[shown]).isEmpty
    }

    var canGoOn: Bool {
        isAnswered(shown)
    }

    var isLast: Bool {
        nextWaiting == nil
    }

    var answers: [String: String] {
        Dictionary(
            request.questions.indices.filter(isAnswered).map {
                (request.questions[$0].question, answer(at: $0))
            },
            uniquingKeysWith: { first, _ in first })
    }

    var lines: [QuestionAnswerLine] {
        request.questions.indices.filter(isAnswered).map {
            QuestionAnswerLine(header: request.questions[$0].header, answer: answer(at: $0))
        }
    }

    func isPicked(_ option: QuestionRequest.Option) -> Bool {
        picks[shown].contains(option.label)
    }

    func isAnswered(_ index: Int) -> Bool {
        !answer(at: index).isEmpty
    }

    func isMarkedAnswered(_ index: Int) -> Bool {
        index != shown && isAnswered(index)
    }

    mutating func pick(_ option: QuestionRequest.Option) {
        typed[shown] = ""
        skipped.remove(shown)
        guard asked.multiSelect else {
            picks[shown] = [option.label]
            return
        }
        if let index = picks[shown].firstIndex(of: option.label) {
            picks[shown].remove(at: index)
        } else {
            picks[shown].append(option.label)
        }
    }

    mutating func show(_ index: Int) {
        guard request.questions.indices.contains(index) else { return }
        shown = index
    }

    mutating func goOn() -> Bool {
        guard let next = nextWaiting else { return true }
        shown = next
        return false
    }

    mutating func skip() -> Bool {
        picks[shown] = []
        typed[shown] = ""
        skipped.insert(shown)
        return goOn()
    }

    static func content(of answers: [String: String], to request: QuestionRequest) -> String {
        request.questions.compactMap { answers[$0.question] }.filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }

    static func lines(of content: String, to request: QuestionRequest?) -> [QuestionAnswerLine] {
        guard let request else { return [QuestionAnswerLine(header: nil, answer: content)] }
        let parts = content.components(separatedBy: "\n\n")
        if parts.count == request.questions.count {
            return zip(request.questions, parts).map {
                QuestionAnswerLine(header: $0.header, answer: $1)
            }
        }
        let header = request.questions.count == 1 ? request.questions.first?.header : nil
        return [QuestionAnswerLine(header: header, answer: content)]
    }

    private var nextWaiting: Int? {
        let count = request.questions.count
        return (1..<max(count, 1)).map { (shown + $0) % count }.first {
            !isAnswered($0) && !skipped.contains($0)
        }
    }

    private func answer(at index: Int) -> String {
        let written = Self.trimmed(typed[index])
        return written.isEmpty ? picks[index].joined(separator: ", ") : written
    }

    private static func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
