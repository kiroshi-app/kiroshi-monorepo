import SwiftUI

struct ConversationIconCell: View {
    let icon: ConversationIcon
    let color: Hue?
    let size: CompanionAvatar.Size

    var body: some View {
        ScaledIconCell(icon: icon, color: color, size: size)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityHidden(true)
    }
}

private struct ScaledIconCell: View {
    let icon: ConversationIcon
    let color: Hue?
    private let glyphShare = 0.375
    @ScaledMetric private var side: CGFloat

    init(icon: ConversationIcon, color: Hue?, size: CompanionAvatar.Size) {
        self.icon = icon
        self.color = color
        _side = ScaledMetric(wrappedValue: size.points, relativeTo: size.textStyle)
    }

    var body: some View {
        let hexagon = CompanionOutline(drawing: FlatHexagon.ground)
        hexagon
            .fill(Color.conversation(.cell(color)))
            .overlay { HexagonBorder() }
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
