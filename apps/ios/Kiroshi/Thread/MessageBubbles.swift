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
    var speaker: String?
    let time: String
    let accessibilityText: Text

    @ScaledMetric(relativeTo: .footnote) private var timeWidth = Self.timeWidth
    @Environment(\.areTimesShown) private var areTimesShown
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        stack
            .modifier(
                MessageAccessibility(
                    readsBlocks: isMarkdown, text: accessibilityText, time: time)
            )
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

    @ViewBuilder private var stack: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 4) {
                column
                if isAvatarDrawn {
                    avatar
                }
            }
        } else {
            HStack(alignment: .bottom, spacing: 8) {
                if !isYours {
                    avatar
                }
                column
            }
        }
    }

    private var column: some View {
        VStack(alignment: isYours ? .trailing : .leading, spacing: 4) {
            if let name {
                Text(name)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 14)
                    .accessibilityHidden(true)
            }
            ForEach(bubbles) { bubble in
                let opensMessage = bubble.id == bubbles.first?.id
                BubbleText(
                    bubble: bubble, isYours: isYours, speaker: opensMessage ? speaker : nil,
                    time: opensMessage ? time : ""
                )
                .padding(isYours ? .leading : .trailing, gutter)
                .frame(maxWidth: .infinity, alignment: isYours ? .trailing : .leading)
                .anchorPreference(key: BubbleRows.self, value: .bounds) { [$0] }
            }
        }
    }

    private var gutter: CGFloat {
        if isYours { 70 } else if dynamicTypeSize.isAccessibilitySize { 0 } else { 48 }
    }

    private var isYours: Bool {
        writer == .you
    }

    private var isAvatarDrawn: Bool {
        switch writer {
        case .person: showsAvatar
        case .companion: showsAvatar && companion != nil
        case .you: false
        }
    }

    private var isMarkdown: Bool {
        bubbles.contains { $0.markdown != nil }
    }

    @ViewBuilder private var avatar: some View {
        switch writer {
        case .person where isAvatarDrawn:
            PersonAvatar(initials: initials)
        case .companion where isAvatarDrawn:
            CompanionAvatar(companion, size: .message)
        case .you, .person, .companion:
            CompanionPlaceholder(size: .message)
                .hidden()
        }
    }
}

private struct MessageAccessibility: ViewModifier {
    let readsBlocks: Bool
    let text: Text
    let time: String

    func body(content: Content) -> some View {
        if readsBlocks {
            content.accessibilityElement(children: .contain)
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .accessibilityValue(time)
                .accessibilityAddTraits(.isStaticText)
        }
    }
}

private struct BubbleRows: PreferenceKey {
    static let defaultValue: [Anchor<CGRect>] = []

    static func reduce(value: inout [Anchor<CGRect>], nextValue: () -> [Anchor<CGRect>]) {
        value += nextValue()
    }
}
