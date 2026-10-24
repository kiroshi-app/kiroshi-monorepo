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
    var markdown: MarkdownMessage?
    var position = Position.alone
}

enum BubbleSplit {
    static func groups(_ blocks: [MarkdownBlock]) -> [[MarkdownBlock]] {
        var groups: [[MarkdownBlock]] = []
        var previous: MarkdownBlock?
        for block in blocks {
            defer { previous = block }
            if block == .rule { continue }
            if let previous, staysWith(previous, block) {
                groups[groups.count - 1].append(block)
            } else {
                groups.append([block])
            }
        }
        return groups.isEmpty && !blocks.isEmpty ? [blocks] : groups
    }

    private static func staysWith(_ previous: MarkdownBlock, _ block: MarkdownBlock) -> Bool {
        switch previous {
        case .heading: true
        case .paragraph(let inline):
            block.isCard || inline.plain.trimmingCharacters(in: .whitespaces).hasSuffix(":")
        default: false
        }
    }
}
