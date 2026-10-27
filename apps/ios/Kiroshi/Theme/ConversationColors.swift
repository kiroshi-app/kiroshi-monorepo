import SwiftUI

enum ConversationColor: Hashable, Sendable {
    case cell(CompanionTint?)
    case glyph(CompanionTint?)
    case pileCounter
    case pileCounterGlyph

    static var allCases: [ConversationColor] {
        let tints = [nil] + CompanionTint.allCases.map(Optional.some)
        return tints.map(cell) + tints.map(glyph) + [pileCounter, pileCounterGlyph]
    }

    var name: String {
        switch self {
        case .cell(let tint): tint.map { "conversation-cell-\($0.rawValue)" } ?? "conversation-cell"
        case .glyph(let tint): ConversationColor.cell(tint).name + "-glyph"
        case .pileCounter: "conversation-pile-counter"
        case .pileCounterGlyph: "conversation-pile-counter-glyph"
        }
    }
}

extension Color {
    static func conversation(_ color: ConversationColor) -> Color {
        Color(color.name)
    }
}
