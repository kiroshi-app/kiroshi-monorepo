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
                            .fixedSize(horizontal: false, vertical: true)
                        if let role = summary.role {
                            RoleBadge(role: role)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let label = summary.timeLabel {
                        Text(label)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                if let preview = summary.preview {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
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
            GroupAvatar(group: group, size: .row, working: summary.workingCompanionIds)
        }
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

private struct RoleBadge: View {
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

struct WorkingLabel: View {
    let name: String
    let font: Font

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "ellipsis")
                .symbolEffect(.variableColor.iterative.dimInactiveLayers.nonReversing)
                .accessibilityHidden(true)
            Text("\(name) is working…")
        }
        .font(font)
        .foregroundStyle(Color.kiroshi(.foreground))
    }
}
