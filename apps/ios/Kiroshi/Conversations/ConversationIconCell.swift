import SwiftUI

struct ConversationIconCell: View {
    let icon: ConversationIcon
    let color: CompanionTint?

    var body: some View {
        ScaledIconCell(icon: icon, color: color)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityHidden(true)
    }
}

private struct ScaledIconCell: View {
    let icon: ConversationIcon
    let color: CompanionTint?
    private let glyphShare = 0.375
    @ScaledMetric private var side: CGFloat

    init(icon: ConversationIcon, color: CompanionTint?) {
        self.icon = icon
        self.color = color
        let row = CompanionAvatar.Size.row
        _side = ScaledMetric(wrappedValue: row.points, relativeTo: row.textStyle)
    }

    var body: some View {
        let hexagon = CompanionOutline(drawing: FlatHexagon.ground)
        hexagon
            .fill(Color.conversation(.cell(color)))
            .overlay {
                hexagon.stroke(Color.conversation(.hexagonOutline), lineWidth: side / 40)
            }
            .overlay {
                Image(systemName: icon.symbolName)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Color.conversation(.glyph(color)))
                    .frame(width: side * glyphShare, height: side * glyphShare)
            }
            .frame(width: side, height: side)
    }
}
