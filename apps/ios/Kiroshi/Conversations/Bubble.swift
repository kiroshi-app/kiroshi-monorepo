import Foundation

struct Bubble: Identifiable, Equatable {
    enum Position: Equatable {
        case alone
        case first
        case middle
        case last

        init(index: Int, count: Int) {
            self =
                switch index {
                case _ where count == 1: .alone
                case 0: .first
                case count - 1: .last
                default: .middle
                }
        }
    }

    let id: String
    let text: AttributedString
    var position = Position.alone
}

enum Paragraphs {
    static func split(_ text: String) -> [String] {
        var paragraphs: [String] = []
        var lines: [Substring] = []
        var isInCode = false
        func close() {
            if !lines.isEmpty {
                paragraphs.append(lines.joined(separator: "\n"))
            }
            lines = []
        }
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                isInCode.toggle()
            }
            if !isInCode, line.allSatisfy(\.isWhitespace) {
                close()
            } else {
                lines.append(line)
            }
        }
        close()
        return paragraphs
    }
}
