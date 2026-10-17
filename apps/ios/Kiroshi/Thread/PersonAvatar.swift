import SwiftUI

struct PersonAvatar: View {
    let initials: String

    var body: some View {
        ScaledPersonAvatar(initials: initials)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityHidden(true)
    }
}

private struct ScaledPersonAvatar: View {
    static let initialsRatio: CGFloat = 0.4

    let initials: String
    @ScaledMetric(relativeTo: .body) private var side = CompanionAvatar.Size.message.points

    var body: some View {
        Canvas { context, size in
            let text = Text(initials)
                .font(.system(size: size.width * Self.initialsRatio, weight: .medium))
                .foregroundStyle(.primary)
            context.draw(text, at: CGPoint(x: size.width / 2, y: size.height / 2))
        }
        .frame(width: side, height: side)
        .background(Color(.systemGray5), in: .circle)
    }
}
