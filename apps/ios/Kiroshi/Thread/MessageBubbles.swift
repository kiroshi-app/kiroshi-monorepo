import SwiftUI

extension EnvironmentValues {
    @Entry var areTimesShown = false
}

struct MessageBubbles: View {
    static let timeWidth: CGFloat = 56
    static let timeGap: CGFloat = 8

    let writer: MessageAuthor
    let bubbles: [Bubble]
    var companion: Companion?
    var initials = ""
    var showsAvatar = false
    var name: String?
    let time: String
    let accessibilityText: Text

    @ScaledMetric(relativeTo: .footnote) private var timeWidth = Self.timeWidth
    @Environment(\.areTimesShown) private var areTimesShown

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if !isYours {
                avatar
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

    private var isYours: Bool {
        writer == .you
    }

    @ViewBuilder private var avatar: some View {
        switch writer {
        case .person where showsAvatar:
            PersonAvatar(initials: initials)
        case .companion where showsAvatar && companion != nil:
            CompanionAvatar(companion, size: .message)
        case .you, .person, .companion:
            CompanionPlaceholder(size: .message)
                .hidden()
        }
    }
}

private struct BubbleRows: PreferenceKey {
    static let defaultValue: [Anchor<CGRect>] = []

    static func reduce(value: inout [Anchor<CGRect>], nextValue: () -> [Anchor<CGRect>]) {
        value += nextValue()
    }
}
