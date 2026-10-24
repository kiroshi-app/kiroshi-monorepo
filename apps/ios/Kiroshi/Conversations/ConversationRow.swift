import SwiftUI

struct ConversationRow: View {
    let summary: ConversationSummary
    @Environment(\.redactionReasons) private var redactionReasons
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(spacing: 12) {
            avatar
                .unredacted()
            VStack(alignment: .leading, spacing: 2) {
                headerLayout {
                    nameLayout {
                        Text(summary.subject.title)
                            .font(.headline)
                            .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                            .fixedSize(horizontal: false, vertical: true)
                        if let role = summary.role {
                            RoleBadge(role: role)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let label = summary.timeLabel {
                        Text(label)
                            .font(
                                summary.needsYou ? .subheadline.weight(.semibold) : .subheadline
                            )
                            .foregroundStyle(
                                summary.needsYou ? Color(.systemOrange) : Color.secondary)
                    }
                }
                if summary.needsYou {
                    NeedsYouLine(detail: summary.preview)
                } else if summary.preview != nil || pile != nil {
                    HStack(spacing: 8) {
                        if let preview = summary.preview {
                            Text(preview)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            Spacer(minLength: 0)
                        }
                        if let pile {
                            ConversationBotPile(members: pile)
                        }
                    }
                }
            }
            .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
        }
        .padding(.vertical, 12)
        .alignmentGuide(.listRowSeparatorTrailing) { $0[.trailing] + 16 }
        .foregroundStyle(.primary)
        .accessibilityElement(children: .combine)
        .accessibilityValue(memberNames)
    }

    @ViewBuilder private var avatar: some View {
        switch summary.subject {
        case .companion where !redactionReasons.isEmpty:
            CompanionPlaceholder(size: .row)
        case .companion(let companion):
            CompanionAvatar(companion, size: .row, isWorking: summary.isWorking)
        case .group(let group):
            ConversationIconCell(icon: group.icon, color: group.color, size: .row)
        }
    }

    private var pile: [Companion]? {
        guard case .group(let group) = summary.subject, !group.members.isEmpty else { return nil }
        return group.members
    }

    private var memberNames: String {
        guard case .group(let group) = summary.subject else { return "" }
        return group.memberNames
    }

    private var nameLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 6))
    }

    private var headerLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
    }
}

struct NeedsYouLine: View {
    let detail: String?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        layout {
            Text("\(Image(systemName: "questionmark.bubble.fill")) Needs you")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color(.systemOrange))
                .fixedSize()
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 5))
    }
}

struct RoleBadge: View {
    let role: String

    var body: some View {
        Text(role)
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 1)
            .background(Color(.systemGray5), in: .rect(cornerRadius: 6))
    }
}

#if DEBUG
    #Preview("Row close-up · light") {
        List(ConversationsFixture.closeUpRows) { ConversationRow(summary: $0) }
            .listStyle(.plain)
    }

    #Preview("Row close-up · dark") {
        List(ConversationsFixture.closeUpRows) { ConversationRow(summary: $0) }
            .listStyle(.plain)
            .preferredColorScheme(.dark)
    }

    #Preview("Conversations · subject icons") {
        SignInRootView(model: .fixture(.conversationIcons))
    }
#endif
