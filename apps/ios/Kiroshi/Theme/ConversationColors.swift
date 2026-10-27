import SwiftUI

enum ConversationColor: Hashable, Sendable {
    case cell(Hue?)
    case glyph(Hue?)
    case pileCounter
    case pileCounterGlyph
}

extension Color {
    static func conversation(_ color: ConversationColor) -> Color {
        switch color {
        case .cell(let hue?): Color(uiColor: .hue(hue, .conversationIcon))
        case .glyph(let hue?): Color(uiColor: .hue(hue, .conversationIconForeground))
        case .cell(nil): Color("conversation-cell")
        case .glyph(nil): Color("conversation-cell-glyph")
        case .pileCounter: Color("conversation-pile-counter")
        case .pileCounterGlyph: Color("conversation-pile-counter-glyph")
        }
    }
}
