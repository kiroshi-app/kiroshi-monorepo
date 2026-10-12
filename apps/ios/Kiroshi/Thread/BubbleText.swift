import SwiftUI

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
