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
