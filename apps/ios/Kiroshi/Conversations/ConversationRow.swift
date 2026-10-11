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
                    Text(summary.subject.title)
                        .font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let label = summary.timeLabel {
                        Text(label)
                            .font(.subheadline)
                            .foregroundStyle(Color.kiroshi(.mutedForeground))
                    }
                }
                if let workingName = summary.workingName {
                    WorkingLabel(name: workingName, font: .subheadline)
                } else if let preview = summary.preview {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(Color.kiroshi(.mutedForeground))
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                }
            }
            .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
        }
        .padding(.vertical, 6)
        .foregroundStyle(Color.kiroshi(.foreground))
        .accessibilityElement(children: .combine)
        .accessibilityValue(memberNames)
    }

    @ViewBuilder private var avatar: some View {
        switch summary.subject {
        case .companion(let companion):
            CompanionAvatar(
                redactionReasons.isEmpty ? companion : nil, size: .row,
                isWorking: summary.isWorking)
        case .group(let group):
            GroupAvatar(group: group, size: .row, working: summary.workingCompanionIds)
        }
    }

    private var memberNames: String {
        guard case .group(let group) = summary.subject else { return "" }
        return group.memberNames
    }

    private var headerLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
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
