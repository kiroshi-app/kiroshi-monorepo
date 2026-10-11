import SwiftUI
import UIKit

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

struct BubbleText: View {
    let bubble: Bubble
    let isYours: Bool

    var body: some View {
        Text(bubble.text)
            .foregroundStyle(isYours ? Color.kiroshi(.userBubbleForeground) : Color.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                isYours ? Color.kiroshi(.userBubble) : Color(.secondarySystemBackground),
                in: shape
            )
            .textSelection(.enabled)
    }

    private var shape: UnevenRoundedRectangle {
        let round: CGFloat = 20
        let joined: CGFloat = 8
        let top = [.middle, .last].contains(bubble.position) ? joined : round
        let bottom = [.first, .middle].contains(bubble.position) ? joined : round
        return isYours
            ? UnevenRoundedRectangle(
                topLeadingRadius: round, bottomLeadingRadius: round, bottomTrailingRadius: bottom,
                topTrailingRadius: top, style: .continuous)
            : UnevenRoundedRectangle(
                topLeadingRadius: top, bottomLeadingRadius: bottom, bottomTrailingRadius: round,
                topTrailingRadius: round, style: .continuous)
    }
}

struct DaySeparator: View {
    let label: String

    var body: some View {
        HStack(spacing: 12) {
            line
            Text(label)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)
            line
        }
    }

    private var line: some View {
        Rectangle()
            .fill(Color(.systemGray4))
            .frame(height: 0.5)
            .accessibilityHidden(true)
    }
}

struct TimesReveal: UIGestureRecognizerRepresentable {
    let reveal: (CGFloat) -> Void
    let release: () -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
        Coordinator()
    }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
        switch pan.state {
        case .began, .changed:
            reveal(max(0, -pan.translation(in: pan.view).x))
        case .ended, .cancelled, .failed:
            release()
        default:
            break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            return velocity.x < 0 && abs(velocity.x) > abs(velocity.y) * 2
        }

        func gestureRecognizer(
            _ recognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
