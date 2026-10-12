import SwiftUI

extension EnvironmentValues {
    @Entry var areTimesShown = false
}

struct MessageBubbles: View {
    static let timeWidth: CGFloat = 56
    static let timeGap: CGFloat = 8

    let isYours: Bool
    let bubbles: [Bubble]
    var author: Companion?
    var showsAvatar = false
    var name: String?
    let time: String
    let accessibilityText: Text

    @ScaledMetric(relativeTo: .footnote) private var timeWidth = Self.timeWidth
    @Environment(\.areTimesShown) private var areTimesShown

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if !isYours {
                if showsAvatar, let author {
                    CompanionAvatar(author, size: .message)
                } else {
                    CompanionPlaceholder(size: .message)
                        .hidden()
                }
            }
            VStack(alignment: isYours ? .trailing : .leading, spacing: 4) {
                if let name {
                    Text(name)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 14)
                }
                ForEach(bubbles) { bubble in
                    BubbleText(bubble: bubble, isYours: isYours)
                        .padding(isYours ? .leading : .trailing, isYours ? 70 : 48)
                        .frame(maxWidth: .infinity, alignment: isYours ? .trailing : .leading)
                        .anchorPreference(key: BubbleRows.self, value: .bounds) { [$0] }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityValue(time)
        .accessibilityAddTraits(.isStaticText)
        .overlayPreferenceValue(BubbleRows.self) { rows in
            if areTimesShown {
                GeometryReader { proxy in
                    ForEach(rows.indices, id: \.self) { index in
                        let row = proxy[rows[index]]
                        Text(time)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .fixedSize()
                            .frame(width: timeWidth, alignment: .trailing)
                            .position(x: row.maxX + Self.timeGap + timeWidth / 2, y: row.midY)
                    }
                }
            }
        }
    }
}

private struct BubbleRows: PreferenceKey {
    static let defaultValue: [Anchor<CGRect>] = []

    static func reduce(value: inout [Anchor<CGRect>], nextValue: () -> [Anchor<CGRect>]) {
        value += nextValue()
    }
}
