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
                avatar
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

    @ViewBuilder private var avatar: some View {
        switch summary.subject {
        case .companion(let companion):
            CompanionAvatar(companion, size: .pinned, isWorking: summary.isWorking)
        case .group(let group):
            GroupAvatar(group: group, size: .pinned, working: summary.workingCompanionIds)
        }
    }
}
