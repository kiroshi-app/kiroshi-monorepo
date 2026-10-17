import SwiftUI

struct PinnedStrip: View {
    let pinned: [ConversationSummary]
    let open: (ConversationSubject) -> Void
    let unpin: (ConversationSummary.ID) -> Void

    var body: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 4) {
                ForEach(pinned) { summary in
                    PinnedChip(summary: summary) {
                        open(summary.subject)
                    } unpin: {
                        unpin(summary.id)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 14)
        }
        .scrollIndicators(.hidden)
    }
}

private struct PinnedChip: View {
    let summary: ConversationSummary
    let open: () -> Void
    let unpin: () -> Void
    @ScaledMetric(relativeTo: .caption) private var width: CGFloat = 80

    var body: some View {
        Menu {
            Button("Unpin", systemImage: "pin.slash", action: unpin)
        } label: {
            VStack(spacing: 4) {
                ConversationAvatarView(
                    avatar: ConversationAvatar(summary.subject), size: .pinned,
                    isWorking: summary.isWorking)
                Text(summary.subject.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(width: width)
            .contentShape(.rect)
        } primaryAction: {
            open()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(summary.subject.title), pinned")
        .accessibilityAction(named: "Unpin", unpin)
    }
}

#if DEBUG
    #Preview("Pinned strip · solo, no colour, red") {
        PinnedStrip(pinned: ConversationsFixture.everywhere, open: { _ in }, unpin: { _ in })
    }

    #Preview("Pinned strip · solo, no colour, red · dark") {
        PinnedStrip(pinned: ConversationsFixture.everywhere, open: { _ in }, unpin: { _ in })
            .preferredColorScheme(.dark)
    }
#endif
