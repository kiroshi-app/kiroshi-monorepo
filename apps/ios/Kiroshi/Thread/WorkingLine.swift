import SwiftUI

struct WorkingLine: View {
    let working: ThreadWorking

    var body: some View {
        HStack(spacing: 8) {
            CompanionAvatar(working.companion, size: .message, isWorking: true)
            Group {
                if working.isSeveral {
                    Text("\(working.name) are working…")
                } else {
                    Text("\(working.name) is working…")
                }
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .modifier(Shimmer())
            .frame(maxWidth: .infinity, alignment: .leading)
            if let since = working.since {
                TimelineView(.periodic(from: since, by: 1)) { timeline in
                    Text(ConversationTime.elapsed(since: since, at: timeline.date))
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 4)
    }
}

private struct Shimmer: ViewModifier {
    static let period = 2.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content.overlay {
                TimelineView(.animation) { timeline in
                    let phase =
                        timeline.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: Self.period) / Self.period
                    LinearGradient(
                        colors: [.clear, .primary.opacity(0.6), .clear],
                        startPoint: UnitPoint(x: phase * 3 - 1.5, y: 0.5),
                        endPoint: UnitPoint(x: phase * 3 - 0.5, y: 0.5))
                }
                .mask(content)
                .accessibilityHidden(true)
            }
        }
    }
}
