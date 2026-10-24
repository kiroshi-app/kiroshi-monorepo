import SwiftUI

struct BubbleText: View {
    let bubble: Bubble
    let isYours: Bool
    var speaker: String?
    var time = ""

    @ScaledMetric(relativeTo: .body) private var cardInset: CGFloat = 6

    var body: some View {
        content
            .background(
                isYours ? Color.kiroshi(.userBubble) : Color(.secondarySystemBackground),
                in: shape
            )
    }

    @ViewBuilder private var content: some View {
        if let markdown = bubble.markdown {
            MarkdownBlocksView(
                blocks: markdown.blocks, messageText: markdown.shownText,
                insetsText: markdown.hasCard, speaker: speaker, time: time
            )
            .foregroundStyle(Color.primary)
            .textSelection(.enabled)
            .padding(.horizontal, markdown.hasCard ? cardInset : 14)
            .padding(.top, markdown.blocks.first?.isCard == true ? cardInset : 10)
            .padding(.bottom, markdown.blocks.last?.isCard == true ? cardInset : 10)
            .accessibilityElement(children: .contain)
        } else {
            Text(bubble.text)
                .foregroundStyle(isYours ? Color.kiroshi(.userBubbleForeground) : Color.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .textSelection(.enabled)
        }
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
