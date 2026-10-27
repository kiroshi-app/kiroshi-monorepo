import SwiftUI

struct ConversationBotPile: View {
    let members: [Companion]

    var body: some View {
        ScaledPile(pile: PileContent(members: members))
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityHidden(true)
    }
}

struct PileContent: Equatable {
    static let limit = 3

    let shown: [Companion]
    let hiddenCount: Int

    init(members: [Companion]) {
        shown = members.count > Self.limit ? Array(members.prefix(Self.limit - 1)) : members
        hiddenCount = members.count - shown.count
    }

    var slotCount: Int {
        shown.count + (hiddenCount > 0 ? 1 : 0)
    }
}

private struct ScaledPile: View {
    private static let height = 15.67
    private static let hexagon = 14.0
    private static let step = 10.0
    private static let knockout = 1.5
    private static let counterSize = 6.3

    let pile: PileContent
    @ScaledMetric(relativeTo: .subheadline) private var unit: CGFloat = 20 / 15.67

    var body: some View {
        ZStack(alignment: .leading) {
            ForEach(Array(pile.shown.enumerated()), id: \.element.id) { index, member in
                hole(at: index)
                slot(at: index) {
                    CompanionAvatarArt(companion: member, isWorking: false)
                }
            }
            if pile.hiddenCount > 0 {
                hole(at: pile.shown.count)
                slot(at: pile.shown.count) {
                    outline.fill(Color.conversation(.pileCounter))
                        .overlay { HexagonBorder() }
                        .overlay {
                            Text("+\(pile.hiddenCount)")
                                .font(
                                    .system(size: Self.counterSize * unit, weight: .bold)
                                        .monospacedDigit()
                                )
                                .lineLimit(1)
                                .minimumScaleFactor(0.5)
                                .foregroundStyle(Color.conversation(.pileCounterGlyph))
                        }
                }
            }
        }
        .compositingGroup()
        .frame(width: width, height: Self.height * unit, alignment: .leading)
    }

    private var outline: CompanionOutline {
        CompanionOutline(drawing: FlatHexagon.ground)
    }

    private var width: CGFloat {
        let ring = Self.hexagon + 2 * Self.knockout
        return (ring + Self.step * Double(pile.slotCount - 1)) * unit
    }

    @ViewBuilder private func hole(at index: Int) -> some View {
        if index > 0 {
            let side = (Self.hexagon + 2 * Self.knockout) * unit
            outline
                .fill(.black)
                .frame(width: side, height: side)
                .offset(x: Self.step * Double(index) * unit)
                .blendMode(.destinationOut)
        }
    }

    private func slot(at index: Int, @ViewBuilder content: () -> some View) -> some View {
        let side = Self.hexagon * unit
        return content()
            .frame(width: side, height: side)
            .offset(x: (Self.knockout + Self.step * Double(index)) * unit)
    }
}
